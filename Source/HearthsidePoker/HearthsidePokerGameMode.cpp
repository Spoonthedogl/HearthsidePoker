#include "HearthsidePokerGameMode.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/World.h"
#include "GameFramework/GameUserSettings.h"
#include "GameFramework/PlayerController.h"
#include "Framework/Application/SlateApplication.h"
#include "GenericPlatform/GenericApplication.h"
#include "GenericPlatform/GenericWindow.h"
#include "IWebBrowserWindow.h"
#include "Misc/Paths.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Misc/ConfigCacheIni.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "UnrealClient.h"
#include "TimerManager.h"
#include "SWebBrowserView.h"
#include "WebBrowserViewport.h"
#include "Widgets/SViewport.h"
#include "Widgets/SWindow.h"
#include "Textures/SlateShaderResource.h"
#include "Windows/WindowsHWrapper.h"

DEFINE_LOG_CATEGORY_STATIC(LogHearthsidePoker, Log, All);
namespace {
    WNDPROC OriginalPokerProc = nullptr;
    HWND PokerWindowHandle = nullptr;
    bool PokerBorderless = false;
    LRESULT CALLBACK PokerFrameProc(HWND Handle, UINT Message, WPARAM W, LPARAM L)
    {
        if (PokerBorderless && Message == WM_NCCALCSIZE) return 0;
        if (PokerBorderless && Message == WM_GETMINMAXINFO) { LRESULT Result=CallWindowProcW(OriginalPokerProc,Handle,Message,W,L); auto* Info=(MINMAXINFO*)L; Info->ptMinTrackSize.x=FMath::Max((int)Info->ptMinTrackSize.x,640); Info->ptMinTrackSize.y=FMath::Max((int)Info->ptMinTrackSize.y,360); return Result; }
        if (PokerBorderless && Message == WM_NCHITTEST && !IsZoomed(Handle))
        {
            RECT R; GetWindowRect(Handle, &R);
            int X = (short)LOWORD(L), Y = (short)HIWORD(L);
            bool Left=X<R.left+8, Right=X>=R.right-8, Top=Y<R.top+8, Bottom=Y>=R.bottom-8;
            if (Top) return Left?HTTOPLEFT:Right?HTTOPRIGHT:HTTOP;
            if (Bottom) return Left?HTBOTTOMLEFT:Right?HTBOTTOMRIGHT:HTBOTTOM;
            if (Left) return HTLEFT; if (Right) return HTRIGHT;
        }
        return CallWindowProcW(OriginalPokerProc, Handle, Message, W, L);
    }
}

// Scale CEF's actual off-screen surface, retaining the original geometry for
// Slate input. CEF caches the scaled geometry and maps pointer positions itself.
// The stock viewport already divides out OS DPI; applying DPI again blurs it.
class FScaledPokerViewport : public FWebBrowserViewport
{
public:
    explicit FScaledPokerViewport(TSharedPtr<IWebBrowserWindow> Window) : FWebBrowserViewport(Window) {}
    float RenderScale = 1.f;
    FIntPoint OutputPixels = FIntPoint::ZeroValue;
    virtual void Tick(const FGeometry& Geometry, double Time, float Delta) override
    {
        const float SlateScale = Geometry.GetAccumulatedLayoutTransform().GetScale();
        OutputPixels = (Geometry.GetLocalSize() * SlateScale).IntPoint();
        const FGeometry RenderGeometry = FGeometry::MakeRoot(Geometry.GetLocalSize(),
            FSlateLayoutTransform(SlateScale * RenderScale, Geometry.GetAbsolutePosition()));
        FWebBrowserViewport::Tick(RenderGeometry, Time, Delta);
    }
};

class SPokerKeyHost : public SCompoundWidget
{
public:
    SLATE_BEGIN_ARGS(SPokerKeyHost) {} SLATE_DEFAULT_SLOT(FArguments, Content) SLATE_END_ARGS()
    TFunction<void()> Toggle;
    void Construct(const FArguments& Args) { ChildSlot[Args._Content.Widget]; }
    virtual FReply OnPreviewKeyDown(const FGeometry&, const FKeyEvent& Event) override
    {
        if (Event.GetKey() == EKeys::F11 || (Event.GetKey() == EKeys::Enter && Event.IsAltDown()))
        {
            if (!Event.IsRepeat() && Toggle) Toggle();
            return FReply::Handled();
        }
        return FReply::Unhandled();
    }
};

namespace
{
    constexpr const TCHAR* DisplaySection = TEXT("HearthsidePoker.Display");
    TSharedPtr<SWindow> GameWindow() { return GEngine && GEngine->GameViewport ? GEngine->GameViewport->GetWindow() : nullptr; }
    FIntPoint WindowOrigin() { const auto Window=GameWindow(); RECT R{}; if(Window.IsValid() && Window->GetNativeWindow()) GetWindowRect((HWND)Window->GetNativeWindow()->GetOSWindowHandle(), &R); return FIntPoint(R.left,R.top); }
    FMonitorInfo CurrentMonitor()
    {
        FDisplayMetrics Metrics;
        FDisplayMetrics::RebuildDisplayMetrics(Metrics);
        const TSharedPtr<SWindow> Window = GameWindow();
        FVector2D Center = Window.IsValid() ? FVector2D(Window->GetPositionInScreen()) + FVector2D(Window->GetSizeInScreen()) * .5 : FVector2D::ZeroVector;
        for (const FMonitorInfo& Monitor : Metrics.MonitorInfo)
            if (Center.X >= Monitor.DisplayRect.Left && Center.X < Monitor.DisplayRect.Right && Center.Y >= Monitor.DisplayRect.Top && Center.Y < Monitor.DisplayRect.Bottom) return Monitor;
        for (const FMonitorInfo& Monitor : Metrics.MonitorInfo) if (Monitor.bIsPrimary) return Monitor;
        FMonitorInfo Fallback;
        Fallback.DisplayRect = Metrics.VirtualDisplayRect;
        Fallback.WorkArea = Metrics.PrimaryDisplayWorkAreaRect;
        return Fallback;
    }
    FIntPoint DesktopSize(const FMonitorInfo& Monitor) { return FIntPoint(Monitor.DisplayRect.Right - Monitor.DisplayRect.Left, Monitor.DisplayRect.Bottom - Monitor.DisplayRect.Top); }
    FIntPoint WindowLimit(const FMonitorInfo& Monitor)
    {
        const TSharedPtr<SWindow> Window = GameWindow();
        const FMargin Border = Window.IsValid() ? Window->GetWindowBorderSize(true) : FMargin(16, 40, 16, 16);
        return FIntPoint(FMath::Max(640, Monitor.WorkArea.Right - Monitor.WorkArea.Left - FMath::CeilToInt(Border.Left + Border.Right)),
            FMath::Max(360, Monitor.WorkArea.Bottom - Monitor.WorkArea.Top - FMath::CeilToInt(Border.Top + Border.Bottom)));
    }
    bool ValidScale(int32 Value) { return Value == 100 || Value == 85 || Value == 70; }
}

AHearthsidePokerGameMode::AHearthsidePokerGameMode()
{
    DefaultPawnClass = nullptr;
    bStartPlayersAsSpectators = true;
}

void AHearthsidePokerGameMode::BeginPlay()
{
    Super::BeginPlay();
    if (!GEngine || !GEngine->GameViewport || IsRunningDedicatedServer()) return;
    bDisplayQA = FParse::Param(FCommandLine::Get(), TEXT("PokerDisplayQA"));
    // QA display mutations only write when an explicit isolated UserDir is given.
    if (bDisplayQA && !FParse::Param(FCommandLine::Get(), TEXT("PokerQAAllowSave")))
        UE_LOG(LogHearthsidePoker, Display, TEXT("Display QA: preference writes suppressed."));
    UGameUserSettings* Settings = GEngine->GetGameUserSettings();
    int32 SavedFPS=60; GConfig->GetInt(DisplaySection,TEXT("FPSLimit"),SavedFPS,GGameUserSettingsIni);
    Settings->SetFrameRateLimit(SavedFPS==0||SavedFPS==30||SavedFPS==120 ? SavedFPS : 60);
    Settings->SetVSyncEnabled(false);
    Settings->ApplyNonResolutionSettings();
    GConfig->GetInt(DisplaySection, TEXT("RenderScalePercent"), RenderScalePercent, GGameUserSettingsIni);
    if (!ValidScale(RenderScalePercent)) RenderScalePercent = 100;
    WindowedResolution = Settings->GetScreenResolution();
    if (WindowedResolution.X < 640 || WindowedResolution.Y < 360) WindowedResolution = FIntPoint(1600, 900);
    GConfig->GetInt(DisplaySection, TEXT("WindowedWidth"), WindowedResolution.X, GGameUserSettingsIni);
    GConfig->GetInt(DisplaySection, TEXT("WindowedHeight"), WindowedResolution.Y, GGameUserSettingsIni);
    bPreviousWorldRenderingDisabled = GEngine->GameViewport->bDisableWorldRendering;
    GEngine->GameViewport->bDisableWorldRendering = true;

    FString PagePath = FPaths::ConvertRelativePathToFull(FPaths::Combine(FPaths::ProjectDir(), TEXT("game/index.html")));
    FPaths::NormalizeFilename(PagePath);
    const FString PageURL = TEXT("file:///") + PagePath.Replace(TEXT(" "), TEXT("%20")).Replace(TEXT("#"), TEXT("%23"));
    PokerSurface = SNew(SWebBrowserView)
        .InitialURL(PageURL).ParentWindow(GameWindow())
        .ShowErrorMessage(true).SupportsTransparency(false).SupportsThumbMouseButtonNavigation(false)
        .BackgroundColor(FColor(23, 20, 30)).BrowserFrameRate(120)
        .OnSuppressContextMenu_Lambda([]() { return true; })
        .OnLoadCompleted_UObject(this, &AHearthsidePokerGameMode::OnPageReady)
        .OnLoadError_Lambda([]() { UE_LOG(LogHearthsidePoker, Error, TEXT("Poker page failed to load. Verify game/index.html exists.")); })
        .OnBeforePopup_Lambda([](FString, FString) { return true; })
        .OnConsoleMessage_Lambda([](const FString& Message, const FString& Source, int32 Line, EWebBrowserConsoleLogSeverity Severity)
        {
            if (Severity == EWebBrowserConsoleLogSeverity::Error || Severity == EWebBrowserConsoleLogSeverity::Fatal)
            { UE_LOG(LogHearthsidePoker, Error, TEXT("JS %s:%d %s"), *Source, Line, *Message); }
            else { UE_LOG(LogHearthsidePoker, Log, TEXT("JS %s"), *Message); }
        });

    if (PokerSurface->GetBrowserWindow().IsValid() && PokerSurface->GetChildren()->Num() == 1)
    {
        TSharedRef<SWidget> Child = PokerSurface->GetChildren()->GetChildAt(0);
        if (Child->GetTypeAsString() == TEXT("SViewport"))
        {
            ScaledViewport = MakeShared<FScaledPokerViewport>(PokerSurface->GetBrowserWindow());
            ScaledViewport->RenderScale = RenderScalePercent / 100.f;
            StaticCastSharedRef<SViewport>(Child)->SetViewportInterface(ScaledViewport.ToSharedRef());
        }
        else UE_LOG(LogHearthsidePoker, Error, TEXT("Unsupported browser viewport type %s"), *Child->GetTypeAsString());
    }
    PokerSurface->BindUObject(TEXT("hearthdisplay"), this, true);
    TSharedRef<SPokerKeyHost> KeyHost = SNew(SPokerKeyHost)[PokerSurface.ToSharedRef()];
    KeyHost->Toggle = [this]() { ToggleFullscreen(); };
    PokerRoot = KeyHost;
    GEngine->GameViewport->AddViewportWidgetContent(PokerRoot.ToSharedRef(), 100);
    if (APlayerController* Controller = GetWorld()->GetFirstPlayerController())
    {
        Controller->bShowMouseCursor = true;
        FInputModeUIOnly InputMode;
        InputMode.SetWidgetToFocus(PokerSurface);
        InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
        Controller->SetInputMode(InputMode);
    }
    FSlateApplication::Get().SetKeyboardFocus(PokerSurface, EFocusCause::SetDirectly);
    UE_LOG(LogHearthsidePoker, Display, TEXT("Opening %s; configurable frame limit; world rendering disabled; settings=%s"), *PageURL, *GGameUserSettingsIni);
}

FString AHearthsidePokerGameMode::DisplayState(bool bOk, const FString& Error) const
{
    TSharedRef<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetBoolField(TEXT("ok"), bOk);
    if (!Error.IsEmpty()) Result->SetStringField(TEXT("error"), Error);
    const UGameUserSettings* Settings = GEngine->GetGameUserSettings();
    const bool bFullscreen = Settings->GetFullscreenMode() != EWindowMode::Windowed;
    const FMonitorInfo Monitor = CurrentMonitor();
    const FIntPoint Desktop = DesktopSize(Monitor), Limit = WindowLimit(Monitor);
    const FIntPoint Output = ScaledViewport.IsValid() ? ScaledViewport->OutputPixels : Settings->GetScreenResolution();
    FIntPoint Texture = FIntPoint::ZeroValue;
    if (PokerSurface.IsValid() && PokerSurface->GetBrowserWindow().IsValid())
        if (FSlateShaderResource* Resource = PokerSurface->GetBrowserWindow()->GetTexture()) Texture = FIntPoint(Resource->GetWidth(), Resource->GetHeight());
    Result->SetStringField(TEXT("mode"), ActiveMode);
    TSharedRef<FJsonObject> LayoutJson = MakeShared<FJsonObject>();
    for (const auto& Pair : WindowLayouts) { TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>(); Entry->SetNumberField(TEXT("width"), Pair.Value.Width()); Entry->SetNumberField(TEXT("height"), Pair.Value.Height()); Entry->SetNumberField(TEXT("x"), Pair.Value.Min.X); Entry->SetNumberField(TEXT("y"), Pair.Value.Min.Y); LayoutJson->SetObjectField(Pair.Key, Entry); }
    Result->SetObjectField(TEXT("layouts"), LayoutJson);
    Result->SetNumberField(TEXT("width"), bFullscreen ? Desktop.X : WindowedResolution.X);
    Result->SetNumberField(TEXT("height"), bFullscreen ? Desktop.Y : WindowedResolution.Y);
    Result->SetNumberField(TEXT("windowedWidth"), WindowedResolution.X);
    Result->SetNumberField(TEXT("windowedHeight"), WindowedResolution.Y);
    Result->SetNumberField(TEXT("scale"), RenderScalePercent);
    Result->SetNumberField(TEXT("desktopWidth"), Desktop.X);
    Result->SetNumberField(TEXT("desktopHeight"), Desktop.Y);
    Result->SetNumberField(TEXT("renderWidth"), Texture.X);
    Result->SetNumberField(TEXT("renderHeight"), Texture.Y);
    Result->SetNumberField(TEXT("outputWidth"), Output.X);
    Result->SetNumberField(TEXT("outputHeight"), Output.Y);
    Result->SetNumberField(TEXT("frameRateLimit"), Settings->GetFrameRateLimit());
    Result->SetBoolField(TEXT("worldRenderingDisabled"), GEngine->GameViewport->bDisableWorldRendering);
    const TSharedPtr<SWindow> Window = GameWindow();
    Result->SetBoolField(TEXT("maximized"), Window.IsValid() && Window->IsWindowMaximized());
    Result->SetNumberField(TEXT("dpi"), Window.IsValid() && Window->GetNativeWindow() ? Window->GetNativeWindow()->GetDPIScaleFactor() : 1.f);
    TArray<TSharedPtr<FJsonValue>> Resolutions;
    for (FIntPoint Choice : {FIntPoint(1280, 720), FIntPoint(1600, 900), FIntPoint(1920, 1080), FIntPoint(2560, 1440)})
        if (Choice.X <= Desktop.X && Choice.Y <= Desktop.Y)
        {
            TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
            Entry->SetNumberField(TEXT("width"), Choice.X); Entry->SetNumberField(TEXT("height"), Choice.Y);
            Resolutions.Add(MakeShared<FJsonValueObject>(Entry));
        }
    if (Resolutions.IsEmpty())
    {
        const int32 Width = FMath::Min(Limit.X, FMath::FloorToInt(Limit.Y * 16.f / 9.f));
        TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
        Entry->SetNumberField(TEXT("width"), Width); Entry->SetNumberField(TEXT("height"), FMath::FloorToInt(Width * 9.f / 16.f));
        Resolutions.Add(MakeShared<FJsonValueObject>(Entry));
    }
    Result->SetArrayField(TEXT("resolutions"), Resolutions);
    FString Json;
    FJsonSerializer::Serialize(Result, TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&Json));
    return Json;
}

FString AHearthsidePokerGameMode::GetSettings() { return DisplayState(); }
FString AHearthsidePokerGameMode::SetFPS(int32 FPS)
{
    if(FPS!=0 && FPS!=30 && FPS!=60 && FPS!=120) return DisplayState(false,TEXT("Choose 30, 60, 120 or unlimited."));
    auto* Settings=GEngine->GetGameUserSettings(); Settings->SetFrameRateLimit(FPS); Settings->SetVSyncEnabled(false); Settings->ApplyNonResolutionSettings();
    GConfig->SetInt(DisplaySection,TEXT("FPSLimit"),FPS,GGameUserSettingsIni); SaveDisplayPreferences(); return DisplayState();
}

void AHearthsidePokerGameMode::SetWindowFrame(bool Borderless)
{
    const auto Window = GameWindow();
    if (!Window.IsValid() || !Window->GetNativeWindow()) return;
    HWND Handle = (HWND)Window->GetNativeWindow()->GetOSWindowHandle();
    LONG_PTR Style = GetWindowLongPtr(Handle, GWL_STYLE);
    if (!OriginalPokerProc) { PokerWindowHandle = Handle; OriginalPokerProc = (WNDPROC)SetWindowLongPtr(Handle, GWLP_WNDPROC, (LONG_PTR)PokerFrameProc); }
    PokerBorderless = Borderless;
    if (Borderless) { Style &= ~WS_CAPTION; Style |= WS_THICKFRAME; }
    else Style |= WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX;
    SetWindowLongPtr(Handle, GWL_STYLE, Style);
    SetWindowPos(Handle, nullptr, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
}

void AHearthsidePokerGameMode::CaptureLayout()
{
    const auto Window = GameWindow();
    if (ActiveMode == TEXT("fullscreen") || FPlatformTime::Seconds() < IgnoreLayoutUntil || !Window.IsValid() || Window->IsWindowMaximized() || Window->IsWindowMinimized()) return;
    if (!Window->GetNativeWindow() || !IsWindow((HWND)Window->GetNativeWindow()->GetOSWindowHandle())) return;
    const FIntPoint Pos = WindowOrigin();
    const FIntPoint Size = ScaledViewport.IsValid() ? ScaledViewport->OutputPixels : WindowedResolution;
    if (Size.X < 640 || Size.Y < 360) return;
    const FIntRect Rect(Pos, Pos + Size);
    if (!WindowLayouts.Contains(ActiveMode) || WindowLayouts[ActiveMode] != Rect)
    {
        WindowLayouts.Add(ActiveMode, Rect); WindowedResolution = Size; SaveDisplayPreferences();
    }
}

FString AHearthsidePokerGameMode::WindowAction(const FString& Action)
{
    const auto Window = GameWindow();
    if (!Window.IsValid() || !Window->GetNativeWindow()) return DisplayState(false, TEXT("Window unavailable."));
    if (Action == TEXT("quit")) { CaptureLayout(); FPlatformMisc::RequestExit(false); return DisplayState(); }
    if (Action == TEXT("minimize")) { Window->Minimize(); return DisplayState(); }
    if (ActiveMode != TEXT("borderless")) return DisplayState(false, TEXT("Use a borderless window for this control."));
    int Hit = Action == TEXT("move") ? HTCAPTION : Action == TEXT("resize") ? HTBOTTOMRIGHT : 0;
    if (!Hit) return DisplayState(false, TEXT("Unknown window action."));
    HWND Handle = (HWND)Window->GetNativeWindow()->GetOSWindowHandle();
    ReleaseCapture();
    // Keyboard move/size enters Windows' own accessible window loop. Arrows or
    // the pointer adjust the window; Enter accepts, Escape cancels.
    PostMessageW(Handle, WM_SYSCOMMAND, Action == TEXT("move") ? SC_MOVE : SC_SIZE + WMSZ_BOTTOMRIGHT, 0);
    return DisplayState();
}

void AHearthsidePokerGameMode::SaveDisplayPreferences()
{
    FString QAUserDir;
    if (bDisplayQA && (!FParse::Param(FCommandLine::Get(), TEXT("PokerQAAllowSave")) || !FParse::Value(FCommandLine::Get(), TEXT("UserDir="), QAUserDir) || QAUserDir.IsEmpty())) return;
    GConfig->SetString(DisplaySection, TEXT("Mode"), *ActiveMode, GGameUserSettingsIni);
    GConfig->SetString(DisplaySection, TEXT("LastWindowMode"), *LastWindowMode, GGameUserSettingsIni);
    for (const auto& Pair : WindowLayouts) { const FString Key = Pair.Key; GConfig->SetInt(DisplaySection, *(TEXT("Layout_") + Key + TEXT("_X")), Pair.Value.Min.X, GGameUserSettingsIni); GConfig->SetInt(DisplaySection, *(TEXT("Layout_") + Key + TEXT("_Y")), Pair.Value.Min.Y, GGameUserSettingsIni); GConfig->SetInt(DisplaySection, *(TEXT("Layout_") + Key + TEXT("_Width")), Pair.Value.Width(), GGameUserSettingsIni); GConfig->SetInt(DisplaySection, *(TEXT("Layout_") + Key + TEXT("_Height")), Pair.Value.Height(), GGameUserSettingsIni); }
    GConfig->SetInt(DisplaySection, TEXT("RenderScalePercent"), RenderScalePercent, GGameUserSettingsIni);
    GConfig->SetInt(DisplaySection, TEXT("WindowedWidth"), WindowedResolution.X, GGameUserSettingsIni);
    GConfig->SetInt(DisplaySection, TEXT("WindowedHeight"), WindowedResolution.Y, GGameUserSettingsIni);
    GEngine->GetGameUserSettings()->SaveSettings();
    GConfig->Flush(false, GGameUserSettingsIni);
}

FString AHearthsidePokerGameMode::ApplySettings(const FString& Mode, int32 Width, int32 Height, int32 Scale)
{
    if (Mode != TEXT("windowed") && Mode != TEXT("borderless") && Mode != TEXT("fullscreen")) return DisplayState(false, TEXT("Choose windowed, borderless window or fullscreen."));
    if (!ValidScale(Scale)) return DisplayState(false, TEXT("Render scale must be 100, 85, or 70."));
    if (Width < 640 || Height < 360 || Width > 16384 || Height > 16384) return DisplayState(false, TEXT("Invalid window resolution."));
    if (!ScaledViewport.IsValid()) return DisplayState(false, TEXT("Browser render surface unavailable."));
    UGameUserSettings* Settings = GEngine->GetGameUserSettings();
    CaptureLayout();
    const bool ModeChanged = Mode != ActiveMode;
    const FString PreviousMode = ActiveMode;
    const FMonitorInfo Monitor = CurrentMonitor();
    const FIntPoint Limit = Mode == TEXT("borderless") ? DesktopSize(Monitor) : WindowLimit(Monitor);
    const FIntPoint RequestedWindowed(FMath::Min(Width, Limit.X), FMath::Min(Height, Limit.Y));
    const bool bWindowSizeUnchanged = RequestedWindowed == WindowedResolution;
    WindowedResolution = RequestedWindowed;
    RenderScalePercent = Scale;
    ScaledViewport->RenderScale = Scale / 100.f;
    const TSharedPtr<SWindow> Window = GameWindow();
    const bool bFullscreen = Mode == TEXT("fullscreen");
    const bool bPreserveMaximize = !ModeChanged && !bFullscreen && bWindowSizeUnchanged && Settings->GetFullscreenMode() == EWindowMode::Windowed && Window.IsValid() && Window->IsWindowMaximized();
    if (ModeChanged && PreviousMode == TEXT("borderless")) SetWindowFrame(false);
    if (!bPreserveMaximize)
    {
        if (Window.IsValid() && Window->IsWindowMaximized()) Window->Restore();
        Settings->SetFullscreenMode(bFullscreen ? EWindowMode::WindowedFullscreen : EWindowMode::Windowed);
        Settings->SetScreenResolution(bFullscreen ? DesktopSize(Monitor) : WindowedResolution);
        Settings->ApplyResolutionSettings(false);
        Settings->ConfirmVideoMode();
    }
    ActiveMode = Mode;
    if (!bFullscreen) LastWindowMode = Mode;
    IgnoreLayoutUntil = FPlatformTime::Seconds() + 1.0;
    if (!bFullscreen && Window.IsValid())
    {
        SetWindowFrame(Mode == TEXT("borderless"));
        if (!bPreserveMaximize) { Window->Resize(FVector2D(WindowedResolution)); if (Mode == TEXT("borderless")) { HWND Handle=(HWND)Window->GetNativeWindow()->GetOSWindowHandle(); SetWindowPos(Handle,nullptr,0,0,WindowedResolution.X,WindowedResolution.Y,SWP_NOMOVE|SWP_NOZORDER|SWP_NOACTIVATE); } }
        if (!bPreserveMaximize && WindowLayouts.Contains(Mode))
        {
            const auto Area = Mode == TEXT("borderless") ? Monitor.DisplayRect : Monitor.WorkArea;
            const FIntPoint Wanted = WindowLayouts[Mode].Min; RECT Bounds; GetWindowRect((HWND)Window->GetNativeWindow()->GetOSWindowHandle(), &Bounds);
            SetWindowPos((HWND)Window->GetNativeWindow()->GetOSWindowHandle(), nullptr, FMath::Clamp(Wanted.X, Area.Left, FMath::Max(Area.Left, Area.Right - (Bounds.right - Bounds.left))), FMath::Clamp(Wanted.Y, Area.Top, FMath::Max(Area.Top, Area.Bottom - (Bounds.bottom - Bounds.top))), 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
        }
    }
    if (!bFullscreen && Window.IsValid()) { const FIntPoint P = WindowOrigin(); WindowLayouts.Add(Mode, FIntRect(P, P + WindowedResolution)); }
    SaveDisplayPreferences();
    if (PokerSurface.IsValid()) PokerSurface->ExecuteJavascript(TEXT("if(window.hearthDisplay)window.hearthDisplay.onNativeState(") + DisplayState() + TEXT(");"));
    UE_LOG(LogHearthsidePoker, Display, TEXT("Display applied mode=%s window=%dx%d scale=%d"), *Mode, WindowedResolution.X, WindowedResolution.Y, Scale);
    return DisplayState(); // Actual texture dimensions settle asynchronously after CEF resize.
}

FString AHearthsidePokerGameMode::ToggleFullscreen()
{
    return ApplySettings(GEngine->GetGameUserSettings()->GetFullscreenMode() == EWindowMode::Windowed ? TEXT("fullscreen") : LastWindowMode, WindowedResolution.X, WindowedResolution.Y, RenderScalePercent);
}

FString AHearthsidePokerGameMode::QAClick(float NormalizedX, float NormalizedY)
{
    if (!FParse::Param(FCommandLine::Get(), TEXT("PokerInputQA"))) return DisplayState(false, TEXT("Native input QA is disabled."));
    if (!PokerSurface.IsValid() || !GameWindow().IsValid() || !FMath::IsFinite(NormalizedX) || !FMath::IsFinite(NormalizedY) || NormalizedX < 0.f || NormalizedX > 1.f || NormalizedY < 0.f || NormalizedY > 1.f)
        return DisplayState(false, TEXT("Invalid QA pointer position."));
    const FGeometry& Geometry = PokerSurface->GetCachedGeometry();
    const FVector2D Position = Geometry.LocalToAbsolute(Geometry.GetLocalSize() * FVector2D(NormalizedX, NormalizedY));
    TSet<FKey> Pressed;
    FPointerEvent Move(0, Position, Position, Pressed, FKey(), 0.f, FModifierKeysState());
    FSlateApplication::Get().ProcessMouseMoveEvent(Move, true);
    Pressed.Add(EKeys::LeftMouseButton);
    FPointerEvent Down(0, Position, Position, Pressed, EKeys::LeftMouseButton, 0.f, FModifierKeysState());
    FSlateApplication::Get().ProcessMouseButtonDownEvent(GameWindow()->GetNativeWindow(), Down);
    Pressed.Empty();
    FPointerEvent Up(0, Position, Position, Pressed, EKeys::LeftMouseButton, 0.f, FModifierKeysState());
    FSlateApplication::Get().ProcessMouseButtonUpEvent(Up);
    return DisplayState();
}

FString AHearthsidePokerGameMode::QAWindowCommand(const FString& Action)
{
    if (!FParse::Param(FCommandLine::Get(), TEXT("PokerInputQA"))) return DisplayState(false, TEXT("Native input QA is disabled."));
    if (GameWindow().IsValid())
    {
        if (Action == TEXT("maximize")) GameWindow()->Maximize();
        else if (Action == TEXT("restore")) GameWindow()->Restore();
        else if (Action == TEXT("test-move") || Action == TEXT("test-resize")) { WindowAction(Action == TEXT("test-move") ? TEXT("move") : TEXT("resize")); HWND H=(HWND)GameWindow()->GetNativeWindow()->GetOSWindowHandle(); for (WPARAM Key : {WPARAM(VK_RIGHT), WPARAM(VK_RIGHT), WPARAM(VK_DOWN), WPARAM(VK_RETURN)}) { PostMessageW(H, WM_KEYDOWN, Key, 1); PostMessageW(H, WM_KEYUP, Key, 1); } }
        else return DisplayState(false, TEXT("Unknown QA window command."));
    }
    return DisplayState();
}

void AHearthsidePokerGameMode::OnPageReady()
{
    UE_LOG(LogHearthsidePoker, Display, TEXT("Poker presentation loaded successfully."));
    FString SavedMode = GEngine->GetGameUserSettings()->GetFullscreenMode() == EWindowMode::Windowed ? TEXT("windowed") : TEXT("fullscreen");
    GConfig->GetString(DisplaySection, TEXT("Mode"), SavedMode, GGameUserSettingsIni);
    GConfig->GetString(DisplaySection, TEXT("LastWindowMode"), LastWindowMode, GGameUserSettingsIni);
    if (LastWindowMode != TEXT("borderless")) LastWindowMode = TEXT("windowed");
    for (FString Key : {FString(TEXT("windowed")), FString(TEXT("borderless"))})
    { int32 X=80, Y=60, W=1600, H=900; GConfig->GetInt(DisplaySection, *(TEXT("Layout_") + Key + TEXT("_X")), X, GGameUserSettingsIni); GConfig->GetInt(DisplaySection, *(TEXT("Layout_") + Key + TEXT("_Y")), Y, GGameUserSettingsIni); GConfig->GetInt(DisplaySection, *(TEXT("Layout_") + Key + TEXT("_Width")), W, GGameUserSettingsIni); GConfig->GetInt(DisplaySection, *(TEXT("Layout_") + Key + TEXT("_Height")), H, GGameUserSettingsIni); WindowLayouts.Add(Key,FIntRect(X,Y,X+FMath::Clamp(W,640,16384),Y+FMath::Clamp(H,360,16384))); }
    IgnoreLayoutUntil = FPlatformTime::Seconds() + 1.0;
    ApplySettings(SavedMode, WindowedResolution.X, WindowedResolution.Y, RenderScalePercent);
    GetWorldTimerManager().SetTimer(LayoutTimer, this, &AHearthsidePokerGameMode::CaptureLayout, 1.f, true);
    FString QAScript;
    if (FParse::Value(FCommandLine::Get(), TEXT("PokerQAScript="), QAScript))
    {
        FString Script;
        if (FFileHelper::LoadFileToString(Script, *QAScript)) PokerSurface->ExecuteJavascript(Script);
        else UE_LOG(LogHearthsidePoker, Error, TEXT("Cannot load opt-in QA script %s"), *QAScript);
    }
    if (bDisplayQA)
    {
        GetWorldTimerManager().SetTimer(DisplayQATimer, this, &AHearthsidePokerGameMode::RunDisplayQA, 2.f, true);
        return;
    }
    if (FParse::Param(FCommandLine::Get(), TEXT("PokerSmokeTest")))
    {
        FTimerHandle ScreenshotTimer;
        GetWorldTimerManager().SetTimer(ScreenshotTimer, FTimerDelegate::CreateWeakLambda(this, [this]()
        {
            if (PokerSurface.IsValid()) PokerSurface->ExecuteJavascript(TEXT("console.log('HEARTHSIDE_QA '+JSON.stringify({title:document.title,ready:document.readyState,buttons:document.querySelectorAll('button').length,canvas:document.querySelectorAll('canvas').length,audio:typeof AudioContext,bodyText:document.body.innerText.slice(0,500)}));window.ue.hearthdisplay.getsettings().then(function(s){console.log('HEARTHSIDE_DISPLAY_PROMISE '+s);});"));
            UE_LOG(LogHearthsidePoker, Display, TEXT("HEARTHSIDE_DISPLAY_NATIVE %s"), *GetSettings());
            FScreenshotRequest::RequestScreenshot(FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Screenshots/Unreal-Smoke-Test.png")), true, false);
        }), 4.f, false);
    }
    float ExitAfter = 8.f;
    const bool bCustomExit = FParse::Value(FCommandLine::Get(), TEXT("PokerQAExitAfter="), ExitAfter);
    if (FParse::Param(FCommandLine::Get(), TEXT("PokerSmokeTest")) || bCustomExit)
    {
        FTimerHandle ExitTimer;
        GetWorldTimerManager().SetTimer(ExitTimer, []() { FPlatformMisc::RequestExit(false); }, FMath::Clamp(ExitAfter, 2.f, 120.f), false);
    }
}

void AHearthsidePokerGameMode::RunDisplayQA()
{
    UE_LOG(LogHearthsidePoker, Display, TEXT("HEARTHSIDE_DISPLAY_QA step=%d %s"), DisplayQAStep, *GetSettings());
    PokerSurface->ExecuteJavascript(TEXT("window.ue.hearthdisplay.getsettings().then(function(s){console.log('HEARTHSIDE_DISPLAY_PROMISE '+s);});"));
    switch (DisplayQAStep++)
    {
    case 0: ApplySettings(TEXT("windowed"), 1280, 720, 100); break;
    case 1: if (GameWindow().IsValid()) GameWindow()->Maximize(); break;
    case 2: ApplySettings(TEXT("fullscreen"), 1600, 900, 100); break;
    case 3: ApplySettings(TEXT("fullscreen"), 1600, 900, 85); break;
    case 4: ApplySettings(TEXT("fullscreen"), 1600, 900, 70); break;
    case 5: ToggleFullscreen(); break;
    case 6:
        UE_LOG(LogHearthsidePoker, Display, TEXT("HEARTHSIDE_DISPLAY_INVALID %s"), *ApplySettings(TEXT("invalid"), 1600, 900, 100));
        ApplySettings(TEXT("windowed"), 1600, 900, 100);
        break;
    case 7:
        FSlateApplication::Get().SetKeyboardFocus(PokerSurface, EFocusCause::SetDirectly);
        FSlateApplication::Get().ProcessKeyDownEvent(FKeyEvent(EKeys::F11, FModifierKeysState(), 0, false, 0, 0));
        break;
    case 8:
        FSlateApplication::Get().ProcessKeyDownEvent(FKeyEvent(EKeys::Enter, FModifierKeysState(false, false, false, false, true, false, false, false, false), 0, false, 0, 0));
        break;
    default:
        FScreenshotRequest::RequestScreenshot(FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Screenshots/Display-QA.png")), true, false);
        GetWorldTimerManager().ClearTimer(DisplayQATimer);
        FTimerHandle ExitTimer;
        GetWorldTimerManager().SetTimer(ExitTimer, []() { FPlatformMisc::RequestExit(false); }, 1.f, false);
    }
}

void AHearthsidePokerGameMode::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    CaptureLayout();
    GetWorldTimerManager().ClearAllTimersForObject(this);
    if (PokerSurface.IsValid()) PokerSurface->UnbindUObject(TEXT("hearthdisplay"), this, true);
    if (PokerRoot.IsValid() && GEngine && GEngine->GameViewport)
    {
        GEngine->GameViewport->RemoveViewportWidgetContent(PokerRoot.ToSharedRef());
        GEngine->GameViewport->bDisableWorldRendering = bPreviousWorldRenderingDisabled;
    }
    if (OriginalPokerProc && PokerWindowHandle && IsWindow(PokerWindowHandle)) SetWindowLongPtr(PokerWindowHandle, GWLP_WNDPROC, (LONG_PTR)OriginalPokerProc);
    OriginalPokerProc = nullptr; PokerWindowHandle = nullptr; PokerBorderless = false;
    PokerRoot.Reset();
    PokerSurface.Reset();
    ScaledViewport.Reset();
    Super::EndPlay(EndPlayReason);
}



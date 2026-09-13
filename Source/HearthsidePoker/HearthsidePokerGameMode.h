#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "HearthsidePokerGameMode.generated.h"

class SWebBrowserView;
class FScaledPokerViewport;
class SWidget;

/** Native UE lifecycle and viewport host for the self-contained poker presentation. */
UCLASS()
class HEARTHSIDEPOKER_API AHearthsidePokerGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    AHearthsidePokerGameMode();
    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

    /** CEF exposes these as asynchronous window.ue.hearthdisplay methods. */
    UFUNCTION() FString GetSettings();
    UFUNCTION() FString SetFPS(int32 FPS);
    UFUNCTION() FString ApplySettings(const FString& Mode, int32 Width, int32 Height, int32 Scale);
    UFUNCTION() FString ToggleFullscreen();
    UFUNCTION() FString WindowAction(const FString& Action);
    /** Only enabled with -PokerInputQA; sends real Slate pointer events for render-scale QA. */
    UFUNCTION() FString QAClick(float NormalizedX, float NormalizedY);
    UFUNCTION() FString QAWindowCommand(const FString& Action);

private:
    void OnPageReady();
    void RunDisplayQA();
    void SaveDisplayPreferences();
    void CaptureLayout();
    void SetWindowFrame(bool Borderless);
    FString ActiveMode = TEXT("windowed");
    FString LastWindowMode = TEXT("windowed");
    TMap<FString, FIntRect> WindowLayouts;
    double IgnoreLayoutUntil = 0;
    FTimerHandle LayoutTimer;
    FString DisplayState(bool bOk = true, const FString& Error = FString()) const;
    TSharedPtr<SWebBrowserView> PokerSurface;
    TSharedPtr<SWidget> PokerRoot;
    TSharedPtr<FScaledPokerViewport> ScaledViewport;
    int32 RenderScalePercent = 100;
    FIntPoint WindowedResolution = FIntPoint(1600, 900);
    bool bPreviousWorldRenderingDisabled = false;
    bool bDisplayQA = false;
    int32 DisplayQAStep = 0;
    FTimerHandle DisplayQATimer;
};

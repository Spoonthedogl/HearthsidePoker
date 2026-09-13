using UnrealBuildTool;
using System.IO;

public class HearthsidePoker : ModuleRules
{
    public HearthsidePoker(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "InputCore" });
        PrivateDependencyModuleNames.AddRange(new[] { "Slate", "SlateCore", "WebBrowser", "ApplicationCore", "Json" });
        // CEF must receive real local files, so stage these outside the pak archive.
        string GameDirectory = Path.GetFullPath(Path.Combine(ModuleDirectory, "../../game"));
        if (Directory.Exists(GameDirectory))
        {
            foreach (string Asset in Directory.GetFiles(GameDirectory, "*", SearchOption.AllDirectories))
            {
                RuntimeDependencies.Add(Asset, StagedFileType.NonUFS);
            }
        }
    }
}

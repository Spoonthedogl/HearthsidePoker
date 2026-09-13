using UnrealBuildTool;
using System.Collections.Generic;

public class HearthsidePokerEditorTarget : TargetRules
{
    public HearthsidePokerEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.Latest;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        ExtraModuleNames.Add("HearthsidePoker");
    }
}

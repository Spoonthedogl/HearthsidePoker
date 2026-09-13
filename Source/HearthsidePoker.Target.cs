using UnrealBuildTool;
using System.Collections.Generic;

public class HearthsidePokerTarget : TargetRules
{
    public HearthsidePokerTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.Latest;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        ExtraModuleNames.Add("HearthsidePoker");
    }
}

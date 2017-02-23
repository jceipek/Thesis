namespace ConstantsGenerator {
    using UnityEditor;
    using UnityEngine;
    using System.IO;

    public static class EnsureHololensSteamVRCompatibility {
        [MenuItem("Edit/Ensure Hololens SteamVR Compatibility")]
        public static void Generate () {
            var steamVRPath = Path.Combine(Application.dataPath, "SteamVR");
            var csFiles = Directory.GetFiles(steamVRPath,"*.cs",SearchOption.AllDirectories);
            foreach (var csFile in csFiles) {
                if (File.Exists(csFile)) {
                    Debug.LogFormat("Modifying {0}...", csFile);
                    var currentContent = File.ReadAllText(csFile);
                    File.WriteAllText(csFile, string.Format("{0}\n{1}\n{2}\n{3}\n",
                        "// Hololens compatibility:",
                        "#if (UNITY_STANDALONE_WIN && !UNITY_EDITOR) && !UNITY_WSA_10_0",
                        currentContent.Replace("\r\n", "\n"),
                        "#endif"));
                }
            }
            Debug.Log("Done ensuring compatibility with SteamVR and Hololens.");
        }
    }
}
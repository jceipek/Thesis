namespace ConstantsGenerator {
    using UnityEditor;
    using UnityEngine;
    using System.IO;

    public static class HololensSteamVRCompatibilityGenerator {
        [MenuItem("Edit/Modify SteamVR to be Compatible with Hololens")]
        public static void Generate () {
            var steamVRPath = Path.Combine(Application.dataPath, "SteamVR");
            var sourcePaths = Directory.GetFiles(steamVRPath,"*.cs",SearchOption.AllDirectories);
            foreach (var path in sourcePaths) {
                if (File.Exists(path)) {
                    Debug.LogFormat("Modifying {0}...",path);
                    var currentContent = File.ReadAllText(path);
                    File.WriteAllText(path, string.Format("// Hololens Compatibility:\n{0}\n{1}\n{2}\n",
                                                          "#if UNITY_STANDALONE_WIN && !UNITY_WSA_10_0",
                                                          currentContent.Replace("\r\n", "\n"),
                                                          "#endif"));
                }
            }
            Debug.Log("SteamVR should now be able to co-exist with Hololens");
        }
    }
}
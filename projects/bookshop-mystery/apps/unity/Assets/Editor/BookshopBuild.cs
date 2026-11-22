using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BookshopMystery.Editor
{
    public static class BookshopBuild
    {
        private const string ScenePath = "Assets/Bookshop.unity";

        [MenuItem("Bookshop/Create investigation scene")]
        public static void CreateScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var stage = new GameObject("Investigation").AddComponent<BookshopStage>();
            stage.Configure(Shader.Find("Standard"), Shader.Find("Unlit/Texture"));
            PlayerSettings.productName = "폐점한 서점의 마지막 영수증";
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        [MenuItem("Bookshop/Build browser player")]
        public static void Web()
        {
            CreateScene();
            string app = Path.GetFullPath(Path.Combine(Application.dataPath, "../../web/public/unity"));
            Directory.CreateDirectory(app);
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
            BuildReport report = BuildPipeline.BuildPlayer(new[] { ScenePath }, app, BuildTarget.WebGL, BuildOptions.None);
            if (report.summary.result != BuildResult.Succeeded)
                throw new InvalidOperationException("Unity Web build failed: " + report.summary.result);

            string loader = Directory.GetFiles(Path.Combine(app, "Build"), "*.loader.js")[0];
            string basename = Path.GetFileName(loader).Replace(".loader.js", "");
            string manifest = "{\"loader\":\"Build/" + basename + ".loader.js\",\"data\":\"Build/" + basename +
                ".data\",\"framework\":\"Build/" + basename + ".framework.js\",\"code\":\"Build/" + basename + ".wasm\"}";
            File.WriteAllText(Path.Combine(app, "viewer.json"), manifest);
        }

        [MenuItem("Bookshop/Capture portrait shots")]
        public static void Capture()
        {
            CreateScene();
            var stage = GameObject.Find("Investigation").GetComponent<BookshopStage>();
            stage.Assemble();
            string output = Environment.GetEnvironmentVariable("BOOKSHOP_CAPTURE_DIR");
            if (string.IsNullOrWhiteSpace(output))
                output = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../production/.work/unity-capture"));
            Directory.CreateDirectory(output);
            foreach (string shot in new[] { "desk", "closed", "receipt", "paper-lower", "printer-a", "printer-b", "record" })
            {
                stage.SetCapturePose(shot, .85f);
                File.WriteAllBytes(Path.Combine(output, shot + ".png"), stage.Photograph(1080, 1920));
            }
        }
    }
}

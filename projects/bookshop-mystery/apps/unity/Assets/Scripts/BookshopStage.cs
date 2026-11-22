using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.Rendering;

namespace BookshopMystery
{
    public sealed class BookshopStage : MonoBehaviour
    {
        [Serializable]
        private class DeskFile
        {
            public Part[] parts;
            public Prop[] objects;
        }

        [Serializable]
        private class Part
        {
            public string group;
            public string shape;
            public float[] position;
            public float[] rotation;
            public float[] scale;
            public string color;
            public string texture;
        }

        [Serializable]
        private class Prop
        {
            public string id;
            public float[] position;
            public float angle;
        }

        [SerializeField] private Shader surfaceShader;
        [SerializeField] private Shader paperShader;

        private readonly Dictionary<string, Transform> props = new();
        private readonly Dictionary<string, Material> materials = new();
        private Camera stageCamera;
        private string evidence = "desk";
        private Mesh paper;
        private float angle;
        private float pitch;
        private bool underside;
        private TextAsset deskFile;
        private DeskFile desk;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void BookshopStageReady();
#endif

        public void Configure(Shader surface, Shader printed)
        {
            surfaceShader = surface;
            paperShader = printed;
        }

        private void Start()
        {
            Assemble();
#if UNITY_WEBGL && !UNITY_EDITOR
            BookshopStageReady();
#endif
        }

        public void Assemble()
        {
            if (stageCamera != null) return;

            deskFile = Resources.Load<TextAsset>("Bookshop/desk");
            desk = JsonUtility.FromJson<DeskFile>(deskFile.text);
            props.Add("desk", transform);
            foreach (Prop prop in desk.objects)
            {
                var root = new GameObject(prop.id).transform;
                root.SetParent(transform, false);
                root.localPosition = Vector(prop.position);
                root.localRotation = Quaternion.Euler(0f, prop.angle, 0f);
                props.Add(prop.id, root);
            }

            paper = CreatePaper();
            foreach (Part part in desk.parts) AddPart(part);

            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(.47f, .40f, .32f);
            AddLight("Amber desk light", new Vector3(-3.2f, 5f, 2.4f), new Color(1f, .79f, .57f), 2.2f);
            AddLight("Window fill", new Vector3(4.5f, 3.2f, -2f), new Color(.64f, .78f, 1f), 1.15f);

            var cameraObject = new GameObject("Desk camera");
            cameraObject.transform.SetParent(transform, false);
            stageCamera = cameraObject.AddComponent<Camera>();
            stageCamera.clearFlags = CameraClearFlags.SolidColor;
            stageCamera.backgroundColor = new Color(.10f, .085f, .07f);
            stageCamera.fieldOfView = 36f;
            stageCamera.nearClipPlane = .03f;
            stageCamera.farClipPlane = 45f;
            ApplyPose();
        }

        public void ShowEvidence(string id)
        {
            if (!props.ContainsKey(id)) return;
            evidence = id;
            angle = 0f;
            pitch = 0f;
            underside = false;
            ApplyPose();
        }

        // This is the browser bridge. Values are bounded by the host in degrees.
        public void OrientEvidence(string orientation)
        {
            string[] values = orientation.Split(',');
            if (values.Length != 3 ||
                !float.TryParse(values[0], NumberStyles.Float, CultureInfo.InvariantCulture, out float yaw) ||
                !float.TryParse(values[1], NumberStyles.Float, CultureInfo.InvariantCulture, out float tilt)) return;

            angle = yaw;
            pitch = Mathf.Clamp(tilt, -30f, 30f);
            underside = values[2] == "1";
            ApplyPose();
        }

        public void SetCapturePose(string shot, float position)
        {
            float at = Mathf.Clamp01(position);
            if (shot == "closed")
            {
                ShowEvidence("desk");
                PointCamera(new Vector3(-2.8f - at * .15f, 3.85f - at * .3f, -.8f), new Vector3(-3.1f, .08f, -2.7f));
                return;
            }
            if (shot == "desk")
            {
                ShowEvidence("desk");
                PointCamera(new Vector3(.2f - at * .5f, 6.3f - at * .35f, 6.4f - at * .5f), new Vector3(.15f, .1f, -.45f));
                return;
            }
            if (shot == "record")
            {
                ShowEvidence("record");
                PointCamera(new Vector3(at * .38f, 4.8f - at * .22f, 3.45f), new Vector3(0f, .46f, 0f));
                return;
            }
            if (shot == "printer-a" || shot == "printer-b")
            {
                ShowEvidence(shot);
                underside = true;
                angle = Mathf.Lerp(28f, 2f, at);
                ApplyPose();
                return;
            }
            ShowEvidence("receipt");
            PointCamera(new Vector3(.18f - .13f * at, 4.8f - .44f * at, 2.75f - .3f * at),
                new Vector3(0f, .54f, shot == "paper-lower" ? .24f : -.32f));
        }

        public byte[] Photograph(int width, int height)
        {
            RenderTexture previous = RenderTexture.active;
            float previousAspect = stageCamera.aspect;
            var target = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            var pixels = new Texture2D(width, height, TextureFormat.RGB24, false);
            try
            {
                stageCamera.targetTexture = target;
                stageCamera.aspect = (float)width / height;
                stageCamera.Render();
                RenderTexture.active = target;
                pixels.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                pixels.Apply();
                return pixels.EncodeToPNG();
            }
            finally
            {
                stageCamera.targetTexture = null;
                stageCamera.aspect = previousAspect;
                RenderTexture.active = previous;
                target.Release();
                DestroyImmediate(target);
                DestroyImmediate(pixels);
            }
        }

        private void ApplyPose()
        {
            foreach (Prop prop in desk.objects)
            {
                Transform root = props[prop.id];
                root.localPosition = Vector(prop.position);
                root.localRotation = Quaternion.Euler(0f, prop.angle, 0f);
                root.gameObject.SetActive(evidence == "desk" || evidence == prop.id);
            }

            if (evidence == "desk")
            {
                PointCamera(new Vector3(.15f, 6.05f, 6.2f), new Vector3(.17f, .10f, -.45f));
                return;
            }

            Transform selected = props[evidence];
            selected.localPosition = new Vector3(0, .42f, 0);
            selected.localRotation = Quaternion.Euler((underside ? -164f : 0f) + pitch, angle, 0f);
            PointCamera(new Vector3(.12f, 3.6f, 3.85f), new Vector3(0f, .48f, 0f));
        }

        private void PointCamera(Vector3 position, Vector3 focus)
        {
            stageCamera.transform.position = position;
            stageCamera.transform.LookAt(focus);
        }

        private void AddPart(Part part)
        {
            var item = part.shape == "plane"
                ? new GameObject(part.texture, typeof(MeshFilter), typeof(MeshRenderer))
                : GameObject.CreatePrimitive(part.shape == "cylinder" ? PrimitiveType.Cylinder : PrimitiveType.Cube);
            item.transform.SetParent(props[part.group], false);
            item.transform.localPosition = Vector(part.position);
            item.transform.localRotation = Quaternion.Euler(Vector(part.rotation));
            Vector3 scale = Vector(part.scale);
            if (part.shape == "cylinder") scale.y *= .5f;
            item.transform.localScale = scale;

            if (part.shape == "plane") item.GetComponent<MeshFilter>().sharedMesh = paper;
            Collider collider = item.GetComponent<Collider>();
            if (collider != null) collider.enabled = false;
            item.GetComponent<MeshRenderer>().sharedMaterial = GetMaterial(part);
        }

        private Material GetMaterial(Part part)
        {
            string key = part.color + "/" + part.texture;
            if (materials.TryGetValue(key, out Material cached)) return cached;
            bool isPaper = !string.IsNullOrEmpty(part.texture) && part.texture != "walnut";
            var material = new Material(isPaper ? paperShader : surfaceShader);
            if (ColorUtility.TryParseHtmlString(part.color, out Color color)) material.color = color;
            if (!string.IsNullOrEmpty(part.texture)) material.mainTexture = Resources.Load<Texture2D>("Bookshop/" + part.texture);
            if (material.HasProperty("_Glossiness")) material.SetFloat("_Glossiness", .23f);
            materials.Add(key, material);
            return material;
        }

        private void AddLight(string title, Vector3 position, Color color, float intensity)
        {
            var source = new GameObject(title);
            source.transform.SetParent(transform, false);
            source.transform.position = position;
            source.transform.LookAt(Vector3.zero);
            var light = source.AddComponent<Light>();
            light.type = LightType.Spot;
            light.range = 16f;
            light.spotAngle = 96f;
            light.color = color;
            light.intensity = intensity;
            light.shadows = LightShadows.Soft;
        }

        private static Vector3 Vector(float[] values) => new(values[0], values[1], values[2]);

        private static Mesh CreatePaper()
        {
            var mesh = new Mesh { name = "Double-sided print surface" };
            mesh.vertices = new[] {
                new Vector3(-.5f, -.5f), new Vector3(-.5f, .5f), new Vector3(.5f, .5f), new Vector3(.5f, -.5f),
                new Vector3(-.5f, -.5f), new Vector3(-.5f, .5f), new Vector3(.5f, .5f), new Vector3(.5f, -.5f)
            };
            mesh.uv = new[] {
                new Vector2(0, 0), new Vector2(0, 1), new Vector2(1, 1), new Vector2(1, 0),
                new Vector2(0, 0), new Vector2(0, 1), new Vector2(1, 1), new Vector2(1, 0)
            };
            mesh.triangles = new[] { 0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6 };
            mesh.RecalculateNormals();
            return mesh;
        }

        private void OnDestroy()
        {
            if (paper != null) DestroyImmediate(paper);
            foreach (Material material in materials.Values) DestroyImmediate(material);
        }
    }
}

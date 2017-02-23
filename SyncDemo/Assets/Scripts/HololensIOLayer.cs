namespace Giverspace {
using UnityEngine;
public class HololensIOLayer : MonoBehaviour, IControllerLayer {
    [System.Serializable]
    class TrackedObjectInfo {
        public Vector3 position;
        public Quaternion rotation;
    }

    [System.Serializable]
    class ControllerInfo : TrackedObjectInfo {
        public bool grabbed;
        public bool action0;
    }

    public void ProcessControllerAttachmentMessage (NetMessage message) {
        // _controller0Manager.UpdateControllerAttachment(message.ControllerAttachments.a);
        // _controller1Manager.UpdateControllerAttachment(message.ControllerAttachments.b);
    }

    void Update () {
        // NetManager.G.SendInputData(_headsetTransform.position, _headsetTransform.rotation,
        //                            _controller0Visualizer.transform.position, _controller0Visualizer.transform.rotation, _controller0Buttons.Grabbing, _controller0Buttons.Action0Active,
        //                            _controller1Visualizer.transform.position, _controller1Visualizer.transform.rotation, _controller1Buttons.Grabbing, _controller1Buttons.Action0Active);
    }
}
}
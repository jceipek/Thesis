namespace Giverspace {
using UnityEngine;
public class DebugIOLayer : MonoBehaviour, IControllerLayer {
    [SerializeField] Transform _headsetTransform;
    [SerializeField] ControllerAttachmentVisualizer _controller0Visualizer;
    [SerializeField] ControllerDebugButtons _controller0Buttons;
    [SerializeField] ControllerAttachmentVisualizer _controller1Visualizer;
    [SerializeField] ControllerDebugButtons _controller1Buttons;

    public void ProcessControllerAttachmentMessage (NetMessage message) {
        _controller0Visualizer.UpdateControllerAttachment(message.ControllerAttachments.a);
        _controller1Visualizer.UpdateControllerAttachment(message.ControllerAttachments.b);
    }

    void Update () {
        NetManager.G.SendInputData(_headsetTransform.position, _headsetTransform.rotation,
                                   _controller0Visualizer.transform.position, _controller0Visualizer.transform.rotation, _controller0Buttons.Grabbing, _controller0Buttons.Action0Active,
                                   _controller1Visualizer.transform.position, _controller1Visualizer.transform.rotation, _controller1Buttons.Grabbing, _controller1Buttons.Action0Active);
    }
}
}
namespace Giverspace {
using UnityEngine;
using Valve.VR;
public class SteamIOLayer : MonoBehaviour, IControllerLayer {
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

    [SerializeField] SteamVR_TrackedObject _headsetTrackedObject;
    TrackedObjectInfo _headsetData = new TrackedObjectInfo();
    [SerializeField] ControllerManager _controller0Manager;
    ControllerInfo _controller0Data = new ControllerInfo();
    [SerializeField] ControllerManager _controller1Manager;
    ControllerInfo _controller1Data = new ControllerInfo();

    public void ProcessControllerAttachmentMessage (NetMessage message) {
        _controller0Manager.UpdateControllerAttachment(message.ControllerAttachments.a);
        _controller1Manager.UpdateControllerAttachment(message.ControllerAttachments.b);
    }

    // void Awake () {
    //     SteamVR_Render.instance.trackingSpace = ETrackingUniverseOrigin.TrackingUniverseRawAndUncalibrated;
    // }

    void OnEnable() {
        SteamVR_Events.NewPoses.Listen(OnNewPoses);
    }

    void OnDisable() {
        SteamVR_Events.NewPoses.Remove(OnNewPoses);
    }

    private void OnNewPoses(TrackedDevicePose_t[] poses) {
        UpdateDataForTrackedObject (_headsetTrackedObject, poses, _headsetData);
        UpdateDataForTrackedObject (_controller0Manager.TrackedObject, poses, _controller0Data);
        UpdateDataForTrackedObject (_controller1Manager.TrackedObject, poses, _controller1Data);

        NetManager.G.SendInputData(_headsetData.position, _headsetData.rotation,
                                   _controller0Data.position, _controller0Data.rotation, _controller0Data.grabbed, _controller0Data.action0,
                                   _controller1Data.position, _controller1Data.rotation, _controller1Data.grabbed, _controller1Data.action0);
    }

    void UpdateDataForTrackedObject (SteamVR_TrackedObject trackedObject, TrackedDevicePose_t[] withPoses, TrackedObjectInfo data) {
        if (trackedObject.index == SteamVR_TrackedObject.EIndex.None)
            return;
        int i = (int)trackedObject.index;
        if (withPoses.Length <= i)
            return;

        if (!withPoses[i].bDeviceIsConnected)
            return;

        if (!withPoses[i].bPoseIsValid)
            return;

        SteamVR_Utils.RigidTransform pose = new SteamVR_Utils.RigidTransform(withPoses[i].mDeviceToAbsoluteTracking);   
        data.position = pose.pos;
        data.rotation = pose.rot;

        var controllerInfo = data as ControllerInfo;
        if (controllerInfo != null) {
            SteamVR_Controller.Device device = SteamVR_Controller.Input((int)trackedObject.index);
            //  controllerInfo.grabbed = device.GetHairTrigger();
            controllerInfo.grabbed = device.GetPress(SteamVR_Controller.ButtonMask.Trigger);
            controllerInfo.action0 = device.GetPress(SteamVR_Controller.ButtonMask.Touchpad);
        }
    }
}
}
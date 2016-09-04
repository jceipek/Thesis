namespace Giverspace {
using UnityEngine;
using Valve.VR;
public class IOLayer : MonoBehaviour {

    [System.Serializable]
    class ControllerInfo {
        [SerializeField] public SteamVR_TrackedObject TrackedObject;
        public Vector3 position;
        public Quaternion rotation;
        public bool grabbed;
    }

    [SerializeField] GameObject _objectPrefab;
    GameObject[] _objects = new GameObject[1000];

    [SerializeField] ControllerInfo[] _controllerInfos;

    public void ProcessPositionMessage (NetMessage message) {
        if (message.ObjectId < _objects.Length) {
            // Debug.Log("ID: "+message.ObjectId);
            if (_objects[message.ObjectId] == null) {
                _objects[message.ObjectId] = Instantiate(_objectPrefab);
            }
            _objects[message.ObjectId].transform.position = message.Position;
        }
    }

    public void ProcessPositionRotationMessage (NetMessage message) {
        if (message.ObjectId < _objects.Length) {
            // Debug.Log("ID: "+message.ObjectId);
            if (_objects[message.ObjectId] == null) {
                _objects[message.ObjectId] = Instantiate(_objectPrefab);
            }
            _objects[message.ObjectId].transform.position = message.Position;
            _objects[message.ObjectId].transform.rotation = message.Rotation;
        }
    }

    void OnEnable()
    {
        SteamVR_Utils.Event.Listen("new_poses", OnNewPoses);
    }

    void OnDisable()
    {
        SteamVR_Utils.Event.Remove("new_poses", OnNewPoses);
    }

    // Parse and dispatch a PositionGeometry() call with the new controller pose.
    private void OnNewPoses(params object[] args) {
        var poses = (TrackedDevicePose_t[])args[0];

        foreach (var controllerInfo in _controllerInfos) {
            var trackedObject = controllerInfo.TrackedObject;
            if (trackedObject.index == SteamVR_TrackedObject.EIndex.None)
                continue;
            int i = (int)trackedObject.index;
            if (poses.Length <= i)
                continue;

            if (!poses[i].bDeviceIsConnected)
                continue;

            if (!poses[i].bPoseIsValid)
                continue;

            SteamVR_Utils.RigidTransform pose = new SteamVR_Utils.RigidTransform(poses[i].mDeviceToAbsoluteTracking);   
            controllerInfo.position = pose.pos;
            controllerInfo.rotation = pose.rot;

             SteamVR_Controller.Device device = SteamVR_Controller.Input((int)trackedObject.index);
            //  controllerInfo.grabbed = device.GetHairTrigger();
             controllerInfo.grabbed = device.GetPress(SteamVR_Controller.ButtonMask.Trigger);

        }
        NetManager.G.SendControllerPositions(_controllerInfos[0].position, _controllerInfos[0].rotation, _controllerInfos[0].grabbed,
                                             _controllerInfos[1].position, _controllerInfos[1].rotation, _controllerInfos[1].grabbed);
    }


    // void SendControllerDataMessage (VRControllerState_t left, VRControllerState_t right) {
    //     _sendBufferStream.Position = 0;
    //     WriteControllerStateWithWriter(left, _sendBufferWriter);
    //     WriteControllerStateWithWriter(right, _sendBufferWriter);
    //     // Length is now 120 bytes!

    //     Debug.LogFormat("SendControllerDataMessage: {0}", _sendBufferStream.Position);
    //     // _clientSock.SendTo(_sendBuffer, (int)_sendBufferStream.Position, SocketFlags.None, _servEP);
    // }

    // private void WriteControllerStateWithWriter (VRControllerState_t state, BinaryWriter writer) {
    //     _sendBufferWriter.Write(state.unPacketNum);
    //     _sendBufferWriter.Write(state.ulButtonPressed);
    //     _sendBufferWriter.Write(state.ulButtonTouched);

    //     _sendBufferWriter.Write(state.rAxis0.x);
    //     _sendBufferWriter.Write(state.rAxis0.y);

    //     _sendBufferWriter.Write(state.rAxis1.x);
    //     _sendBufferWriter.Write(state.rAxis1.y);

    //     _sendBufferWriter.Write(state.rAxis2.x);
    //     _sendBufferWriter.Write(state.rAxis2.y);

    //     _sendBufferWriter.Write(state.rAxis3.x);
    //     _sendBufferWriter.Write(state.rAxis3.y);

    //     _sendBufferWriter.Write(state.rAxis4.x);
    //     _sendBufferWriter.Write(state.rAxis4.y);
    // }
}
}
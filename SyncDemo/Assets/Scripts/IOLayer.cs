namespace Giverspace {
using UnityEngine;
using Valve.VR;
public class IOLayer : MonoBehaviour {
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
    [SerializeField] SteamVR_TrackedObject _controller0TrackedObject;
    ControllerInfo _controller0Data = new ControllerInfo();
    [SerializeField] SteamVR_TrackedObject _controller1TrackedObject;
    ControllerInfo _controller1Data = new ControllerInfo();


    [SerializeField] GameObject _objectPrefab;
    [SerializeField] GameObject _lineSegmentPrefab;
    [SerializeField] GameObject _velocityColorEntityPrefab;
    GameObject[] _objects = new GameObject[1000];
    LineSegment[] _lineSegments = new LineSegment[1000]; 
    VelocityColorEntity[] _velocityColorEntities = new VelocityColorEntity[1000]; 

    public void ProcessMessage (NetMessage message) {
        switch (message.MessageType) {
            case MessageType.Position:
                ProcessPositionMessage(message);
                break;
            case MessageType.PositionRotation:
                ProcessPositionRotationMessage(message);
                break;
            case MessageType.PositionRotationVelocityColor:
                ProcessPositionRotationVelocityColorMessage(message);
                break;
            case MessageType.Segment:
                ProcessSegmentMessage(message);
                break;
        }
    }

    void ProcessPositionMessage (NetMessage message) {
        if (message.ObjectId < _objects.Length) {
            // Debug.Log("ID: "+message.ObjectId);
            if (_objects[message.ObjectId] == null) {
                _objects[message.ObjectId] = Instantiate(_objectPrefab);
            }
            _objects[message.ObjectId].transform.position = message.Position;
        }
    }

    void ProcessPositionRotationMessage (NetMessage message) {
        if (message.ObjectId < _objects.Length) {
            // Debug.Log("ID: "+message.ObjectId);
            if (_objects[message.ObjectId] == null) {
                _objects[message.ObjectId] = Instantiate(_objectPrefab);
            }
            _objects[message.ObjectId].transform.position = message.Position;
            _objects[message.ObjectId].transform.rotation = message.Rotation;
        }
    }

    void ProcessPositionRotationVelocityColorMessage (NetMessage message) {
        if (message.ObjectId < _velocityColorEntities.Length) {
            // Debug.Log("ID: "+message.ObjectId);
            if (_velocityColorEntities[message.ObjectId] == null) {
                _velocityColorEntities[message.ObjectId] = (Instantiate(_velocityColorEntityPrefab, Vector3.zero, Quaternion.identity) as GameObject).GetComponent<VelocityColorEntity>();
                _velocityColorEntities[message.ObjectId].Init();
            }
            _velocityColorEntities[message.ObjectId].UpdatePosRotColorVel(message.Position, message.Rotation, message.Velocity, message.Color);
        }  
    }

    void ProcessSegmentMessage (NetMessage message) {
        if (message.ObjectId < _lineSegments.Length) {
            // Debug.Log("ID: "+message.ObjectId);
            if (_lineSegments[message.ObjectId] == null) {
                _lineSegments[message.ObjectId] = (Instantiate(_lineSegmentPrefab, Vector3.zero, Quaternion.identity) as GameObject).GetComponent<LineSegment>();
            }
            _lineSegments[message.ObjectId].StartPoint = message.Position;
            _lineSegments[message.ObjectId].EndPoint = message.Destination;
            _lineSegments[message.ObjectId].SetColor(message.Color);
        }
    }

    // void Awake () {
    //     SteamVR_Render.instance.trackingSpace = ETrackingUniverseOrigin.TrackingUniverseRawAndUncalibrated;
    // }

    void OnEnable() {
        SteamVR_Utils.Event.Listen("new_poses", OnNewPoses);
    }

    void OnDisable() {
        SteamVR_Utils.Event.Remove("new_poses", OnNewPoses);
    }

    // Parse and dispatch a PositionGeometry() call with the new controller pose.
    private void OnNewPoses(params object[] args) {
        var poses = (TrackedDevicePose_t[])args[0];
        UpdateDataForTrackedObject (_headsetTrackedObject, poses, _headsetData);
        UpdateDataForTrackedObject (_controller0TrackedObject, poses, _controller0Data);
        UpdateDataForTrackedObject (_controller1TrackedObject, poses, _controller1Data);

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
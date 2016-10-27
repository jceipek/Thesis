namespace Giverspace {
using UnityEngine;

public class MessageHandler : MonoBehaviour {
    [SerializeField] MonoBehaviour _controllerLayer;
    IControllerLayer _icontrollerLayer;
    [SerializeField] GameObject _lineSegmentPrefab;
    [SerializeField] GameObject _velocityColorEntityPrefab;
    [SerializeField] GameObject _modelPrefab;
    LineSegment[] _lineSegments = new LineSegment[1000]; 
    VelocityColorEntity[] _velocityColorEntities = new VelocityColorEntity[1000]; 
    Model[] _models = new Model[1000];

    void Awake () {
        _icontrollerLayer = _controllerLayer as IControllerLayer;
    }
    public void ProcessMessage (NetMessage message) {
        switch (message.MessageType) {
            case MessageType.Position:
                Debug.LogError("Position Message Not Handled");
                break;
            case MessageType.PositionRotation:
                Debug.LogError("PositionRotation Message Not Handled");
                break;
            case MessageType.PositionRotationVelocityColor:
                ProcessPositionRotationVelocityColorMessage(message);
                break;
            case MessageType.Segment:
                ProcessSegmentMessage(message);
                break;
            case MessageType.PositionRotationScaleVisibleTintModel:
                ProcessPositionRotationScaleVisibleTintModelMessage(message);
                break;
            case MessageType.SimulationTime:
                ProcessSimulationTimeMessage(message);
                break;
            case MessageType.ControllerAttachment:
                ProcessControllerAttachmentMessage(message);
                break;
        }
    }

    public static float _simulationTime; 
    void ProcessSimulationTimeMessage (NetMessage message) {
        _simulationTime = message.Time;
    }

    void ProcessControllerAttachmentMessage (NetMessage message) {
        _icontrollerLayer.ProcessControllerAttachmentMessage(message);
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

    void ProcessPositionRotationScaleVisibleTintModelMessage (NetMessage message) {
        if (message.ObjectId < _lineSegments.Length) {
            // Debug.Log("ID: "+message.ObjectId);
            if (_models[message.ObjectId] == null) {
                _models[message.ObjectId] = (Instantiate(_modelPrefab, Vector3.zero, Quaternion.identity) as GameObject).GetComponent<Model>();
            }
            _models[message.ObjectId].UpdateData(message.ModelType, message.Position, message.Rotation, message.Scale, message.Tint, message.Visible, message.GizmoVisuals);
        }
    }

}
}
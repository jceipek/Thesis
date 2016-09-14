using UnityEngine;

public class VelocityColorEntity : MonoBehaviour {
	[SerializeField] Renderer _renderer;
	[SerializeField] LineSegment _lineSegment;

	public void Init () {
		_renderer.material = new Material(_renderer.material); 
	}
	
	public void UpdatePosRotColorVel (Vector3 pos, Quaternion rot, Vector3 vel, Color32 color) {
		transform.position = pos;
		transform.rotation = rot;
		_renderer.material.color = color;
		_lineSegment.StartPoint = pos;
		_lineSegment.EndPoint = pos+rot*vel;
	}
}
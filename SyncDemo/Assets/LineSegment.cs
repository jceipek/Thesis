using UnityEngine;

public class LineSegment : MonoBehaviour, ISegmentsProvider {

	MeshRenderer _meshRenderer;
	Material _material;
	void Awake () {
		_meshRenderer = GetComponent<MeshRenderer>();
	}

	public Vector3 StartPoint;
	public Vector3 EndPoint;

	public Vector3 Segment (int i) {
		switch (i) {
			case 0:
				return StartPoint;
			case 1:
				return EndPoint;
			default:
				UnityEngine.Assertions.Assert.IsFalse(true);
				return Vector3.zero;
		}
	}

	public Vector3 Tangent (int i) {
		switch (i) {
			case 0:
			case 1:
				return (EndPoint - StartPoint).normalized;
			default:
				UnityEngine.Assertions.Assert.IsFalse(true);
				return Vector3.zero;
		}
	}

	public int Count { get { return 2; } }


	public void SetColor (Color32 color) {
		if (_material != null) {
			_material = new Material(_meshRenderer.material);
			_meshRenderer.material = _material;
		}
		_material.color = color;
	}

}

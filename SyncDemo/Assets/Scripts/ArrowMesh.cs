namespace Giverspace
{

using UnityEngine;
// using UnityEditor;

public class ArrowMesh : MonoBehaviour {
	[SerializeField] MeshFilter _meshFilter;
	Mesh _mesh;

	const int ARROW_RESOLUTION = 20;
	Vector3[] _vertices = new Vector3[ArrowheadVertexCount(ARROW_RESOLUTION)+CappedCylinderVertexCount(ARROW_RESOLUTION)];
	// Vector3[] _vertices = new Vector3[CappedCylinderVertexCount(ARROW_RESOLUTION)];
	// Vector3[] _vertices = new Vector3[ArrowheadVertexCount(ARROW_RESOLUTION)];
	Vector3[] _normals = new Vector3[ArrowheadVertexCount(ARROW_RESOLUTION)+CappedCylinderVertexCount(ARROW_RESOLUTION)];
	// Vector3[] _normals = new Vector3[CappedCylinderVertexCount(ARROW_RESOLUTION)];
	// Vector3[] _normals = new Vector3[ArrowheadVertexCount(ARROW_RESOLUTION)];
	int[] _triangleIndices = new int[(ArrowheadTriangleCount(ARROW_RESOLUTION)+CappedCylinderTriangleCount(ARROW_RESOLUTION))*3];
	// int[] _triangleIndices = new int[(ArrowheadTriangleCount(ARROW_RESOLUTION))*3];

	void Awake () {
		_mesh = new Mesh();
		_mesh.MarkDynamic();
		_meshFilter.mesh = _mesh;
	}

	[SerializeField] Vector3 _pointingFrom = Vector3.zero;
	[SerializeField] Vector3 _pointingTo = Vector3.zero;
	public void UpdatePoints (Vector3 pointingFrom, Vector3 pointingTo) {
		_pointingFrom = pointingFrom;
		_pointingTo = pointingTo;
	}

	void Start () {
		int indexOffset = 0;
		int vertOffset = 0;
		AppendArrowheadTriangles(_triangleIndices, startVertOffset: vertOffset, startIndexOffset: indexOffset, resolution: ARROW_RESOLUTION);
		indexOffset += ArrowheadTriangleCount(ARROW_RESOLUTION)*3;
		vertOffset += ArrowheadVertexCount(ARROW_RESOLUTION);
		AppendCappedCylinderTriangles(triangleIndexBuffer: _triangleIndices,
		                 			  startVertOffset: vertOffset, startIndexOffset: indexOffset, resolution: ARROW_RESOLUTION);
		indexOffset += CappedCylinderTriangleCount(ARROW_RESOLUTION)*3;
		vertOffset += CappedCylinderVertexCount(ARROW_RESOLUTION);

		_mesh.vertices = _vertices;
		_mesh.normals = _normals;
		_mesh.triangles = _triangleIndices;
		_mesh.RecalculateBounds();
	}

	[SerializeField] float _baseArrowHeadDiameter = 0.15f/2f; 
	[SerializeField] float _baseArrowHeadLength = 0.2f/2f;
	[SerializeField] float _baseCyclinderDiameter = 0.07f/2f;
	void Update () {
		Quaternion rotation = Quaternion.identity;
		float magnitude = (_pointingTo - _pointingFrom).magnitude;
		float arrowheadDiameter = Mathf.Lerp(0f, _baseArrowHeadDiameter, magnitude/_baseArrowHeadLength);
		float arrowheadLength = Mathf.Lerp(0f, _baseArrowHeadLength, magnitude/_baseArrowHeadLength); 
		float cyclinderDiameter = _baseCyclinderDiameter/_baseArrowHeadDiameter * arrowheadDiameter;
		if (Mathf.Approximately(magnitude, 0f)) {
			arrowheadDiameter = 0f;
			cyclinderDiameter = 0f;
			arrowheadLength = 0f;
		}

		float cylinderLength = magnitude - arrowheadLength;
		Vector3 forward = (_pointingTo - _pointingFrom).normalized;
		Vector3 cylinderTip = _pointingFrom + forward * cylinderLength;

		if (!Mathf.Approximately(magnitude, 0f)) {
			// XXX(JULIAN): Hacky; may need || transport frame to prevent weirdness during transition to facing along world axes
			if (Mathf.Approximately((Vector3.up - forward).sqrMagnitude, 0f)) {
				Vector3 cross = Vector3.Cross(Vector3.right, forward);
				rotation = Quaternion.LookRotation(cross, forward);
			} else {
				Vector3 cross = Vector3.Cross(Vector3.up, forward);
				rotation = Quaternion.LookRotation(cross, forward);
			}
		}

		// Debug.DrawLine(_pointingFrom, _pointingTo, Color.green);
		// Debug.DrawRay(Vector3.zero, Vector3.up*5f, Color.red);
		// Debug.DrawRay(Vector3.zero, rotation*(Vector3.up*5f), Color.blue);

		int vertOffset = 0;
		AppendArrowhead(vertexBuffer: _vertices, normalsBuffer: _normals,
		                tipPos: _pointingTo, length: arrowheadLength, diameter: arrowheadDiameter, rotation: rotation, startVertOffset: vertOffset, resolution: ARROW_RESOLUTION);
		vertOffset += ArrowheadVertexCount(ARROW_RESOLUTION);
		
		AppendCappedCylinder(vertexBuffer: _vertices, normalsBuffer: _normals,
		                 	tipPos: cylinderTip, length: cylinderLength, diameter: cyclinderDiameter, rotation: rotation, startVertOffset: vertOffset, resolution: ARROW_RESOLUTION);
		vertOffset += CappedCylinderVertexCount(ARROW_RESOLUTION);

		_mesh.vertices = _vertices;
		_mesh.normals = _normals;
		_mesh.RecalculateBounds();
	}

	static int ArrowheadVertexCount (int resolution) {
		return 1 + resolution + resolution + 1;
	}

	static int ArrowheadTriangleCount (int resolution) {
		return resolution*2;
	}

	static int CappedCylinderVertexCount (int resolution) {
		return 1 + resolution*4 + 1;
	}

	static int CappedCylinderTriangleCount (int resolution) {
		return resolution*4;
	}

	static void AppendArrowheadTriangles (int[] triangleIndexBuffer, int startVertOffset, int startIndexOffset, int resolution) {
		for (int i = 0; i < resolution; i++) {
			triangleIndexBuffer[startIndexOffset+i*3] = startVertOffset;
			triangleIndexBuffer[startIndexOffset+i*3+1] = startVertOffset+1+((i+1)%resolution);
			triangleIndexBuffer[startIndexOffset+i*3+2] = startVertOffset+1+i;
		}

		int baseIndex = startIndexOffset+(resolution-1)*3+3;
		for (int i = 0; i < resolution; i++) {
			triangleIndexBuffer[baseIndex+i*3] = startVertOffset+1+resolution+resolution;
			triangleIndexBuffer[baseIndex+i*3+1] = startVertOffset+1+resolution+i;
			triangleIndexBuffer[baseIndex+i*3+2] = startVertOffset+1+resolution+((i+1)%resolution);
		}
	}
	
	static void AppendArrowhead (Vector3[] vertexBuffer, Vector3[] normalsBuffer,
	                             Vector3 tipPos, float length, float diameter, Quaternion rotation, int startVertOffset, int resolution) {
		vertexBuffer[startVertOffset] = tipPos;
		normalsBuffer[startVertOffset] = rotation*Vector3.up;
		
		// Based on http://slabode.exofire.net/circle_draw.shtml
		float theta = 2f * Mathf.PI/(float)resolution; 
		float c = Mathf.Cos(theta);//precalculate the sine and cosine
		float s = Mathf.Sin(theta);
		float t;

		float x = diameter/2f;//we start at angle = 0 
		float y = 0;

		Vector3 basePos = tipPos + -(rotation * new Vector3(0f, length, 0f));
		for (int i = 0; i < resolution; i++) {
			var newVertPos = rotation*new Vector3(x, 0f, y);
			vertexBuffer[startVertOffset+1+i] = basePos + newVertPos; // Part of arrow head
			normalsBuffer[startVertOffset+1+i] = Vector3.Cross((tipPos-(newVertPos+basePos)).normalized,
															   Vector3.Cross(newVertPos.normalized,
															   				 (tipPos-basePos).normalized));
			// Debug.LogFormat(">{0}:",startOffset+1+i);
			// Debug.DrawRay(newVertPos, ((tipPos-newVertPos)).normalized, Color.red);
			// Debug.DrawRay(newVertPos, Vector3.Cross(new Vector3(x, 0f, y), Vector3.up), Color.green);
			// Debug.DrawRay(newVertPos, new Vector3(x, 0f, y), Color.blue);

			vertexBuffer[startVertOffset+1+resolution+i] = basePos + newVertPos; // Part of base
			normalsBuffer[startVertOffset+1+resolution+i] = -(rotation*Vector3.up);
			// Debug.LogFormat(">>{0}:",startOffset+1+resolution+i);
			// Debug.DrawRay(newVertPos, Vector3.down, Color.blue);
			
			//apply the rotation matrix
			t = x;
			x = c * x - s * y;
			y = s * t + c * y;
		} 

		vertexBuffer[startVertOffset+1+resolution+resolution] = basePos;
		normalsBuffer[startVertOffset+1+resolution+resolution] = -(rotation*Vector3.up);
		// Debug.LogFormat(">>>{0}:",startOffset+1+resolution+resolution);
	}
	static void AppendCappedCylinderTriangles (int[] triangleIndexBuffer,
	                                           int startVertOffset, int startIndexOffset, int resolution) {
		// TOP
		for (int i = 0; i < resolution; i++) {
			triangleIndexBuffer[startIndexOffset+i*3] = startVertOffset;
			triangleIndexBuffer[startIndexOffset+i*3+1] = startVertOffset+1+((i+1)%resolution);
			triangleIndexBuffer[startIndexOffset+i*3+2] = startVertOffset+1+i;
		}

		// BOTTOM
		// int baseIndex = startIndexOffset+resolution*3*3;
		for (int i = 0; i < resolution; i++) {
			triangleIndexBuffer[startIndexOffset+resolution*3+i*3] = startVertOffset+1+resolution+i;
			triangleIndexBuffer[startIndexOffset+resolution*3+i*3+1] = startVertOffset+1+resolution+((i+1)%resolution);
			triangleIndexBuffer[startIndexOffset+resolution*3+i*3+2] = startVertOffset+1+resolution*2+i;

			triangleIndexBuffer[startIndexOffset+(resolution*2)*3+i*3] = startVertOffset+1+resolution*2+i;
			triangleIndexBuffer[startIndexOffset+(resolution*2)*3+i*3+1] = startVertOffset+1+resolution+((i+1)%resolution);
			triangleIndexBuffer[startIndexOffset+(resolution*2)*3+i*3+2] = startVertOffset+1+resolution*2+((i+1)%resolution);
		}

		// BOTTOM
		int baseIndex = startIndexOffset+resolution*3*3;
		for (int i = 0; i < resolution; i++) {
			triangleIndexBuffer[baseIndex+i*3] = startVertOffset+1+resolution*4;
			triangleIndexBuffer[baseIndex+i*3+1] = startVertOffset+1+resolution*3+i;
			triangleIndexBuffer[baseIndex+i*3+2] = startVertOffset+1+resolution*3+((i+1)%resolution);
		}
	}
	static void AppendCappedCylinder (Vector3[] vertexBuffer, Vector3[] normalsBuffer,
	                                  Vector3 tipPos, float length, float diameter, Quaternion rotation, int startVertOffset, int resolution) {
		vertexBuffer[startVertOffset] = tipPos;
		normalsBuffer[startVertOffset] = rotation*Vector3.up;

		Vector3 basePos = tipPos + rotation * new Vector3(0f,-length,0f);
		
		// Based on http://slabode.exofire.net/circle_draw.shtml
		float theta = 2f * Mathf.PI/(float)resolution; 
		float c = Mathf.Cos(theta);//precalculate the sine and cosine
		float s = Mathf.Sin(theta);
		float t;

		float x = diameter/2f;//we start at angle = 0 
		float y = 0;

		for (int i = 0; i < resolution; i++) {
			var newVertPos = rotation*new Vector3(x, 0, y);
			vertexBuffer[startVertOffset+1+i] = newVertPos + tipPos; // Part of top (cap)
			normalsBuffer[startVertOffset+1+i] = rotation*Vector3.up;

			vertexBuffer[startVertOffset+1+resolution+i] = newVertPos + tipPos; // Top of cylinder
			normalsBuffer[startVertOffset+1+resolution+i] = newVertPos.normalized;

			vertexBuffer[startVertOffset+1+resolution*2+i] = newVertPos + basePos; // Bottom of cylinder
			normalsBuffer[startVertOffset+1+resolution*2+i] = newVertPos.normalized;

			vertexBuffer[startVertOffset+1+resolution*3+i] = newVertPos + basePos; // Part of bottom (cap)
			normalsBuffer[startVertOffset+1+resolution*3+i] = -(rotation*Vector3.up);

			//apply the rotation matrix
			t = x;
			x = c * x - s * y;
			y = s * t + c * y;
		} 

		vertexBuffer[startVertOffset+1+resolution*4] = basePos;
		normalsBuffer[startVertOffset+1+resolution*4] = -(rotation*Vector3.up);
	}

	// void OnDrawGizmos () {
	// 	// for (int i = 0; i < _triangleIndices.Length; i += 3) {
	// 	// 	Debug.DrawLine(_vertices[_triangleIndices[i]],_vertices[_triangleIndices[i+1]], Color.red);
	// 	// 	Debug.DrawLine(_vertices[_triangleIndices[i+1]],_vertices[_triangleIndices[i+2]], Color.green);
	// 	// 	Debug.DrawLine(_vertices[_triangleIndices[i+2]],_vertices[_triangleIndices[i]], Color.blue);
	// 	// }
	// 	for (int i = 0; i < _vertices.Length; i++) {
	// 		Debug.DrawRay(_vertices[i], _normals[i]*0.2f, Color.cyan);
	// 		DrawDebugAxes(_vertices[i], 0.1f);
	// 		DrawLabel(_vertices[i]+_normals[i]*0.2f, i);
	// 	}
	// }

	void DrawDebugAxes (Vector3 pos, float scale) {
		Debug.DrawLine(pos + Vector3.right * scale/2f, pos - Vector3.right * scale/2f);
		Debug.DrawLine(pos + Vector3.up * scale/2f, pos - Vector3.up * scale/2f);
		Debug.DrawLine(pos + Vector3.forward * scale/2f, pos - Vector3.forward * scale/2f);
	}

	// void DrawLabel (Vector3 pos, int index) {
	// 	Handles.Label( pos, index.ToString());
	// }
}

}
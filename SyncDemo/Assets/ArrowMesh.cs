using UnityEngine;
using UnityEditor;

public class ArrowMesh : MonoBehaviour {
	[SerializeField] MeshFilter _meshFilter;
	Mesh _mesh;

	const int ARROW_RESOLUTION = 20;
	Vector3[] _vertices = new Vector3[ArrowheadVertexCount(ARROW_RESOLUTION)+CappedCylinderVertexCount(ARROW_RESOLUTION)];
	// Vector3[] _vertices = new Vector3[CappedCylinderVertexCount(ARROW_RESOLUTION)];
	Vector3[] _normals = new Vector3[ArrowheadVertexCount(ARROW_RESOLUTION)+CappedCylinderVertexCount(ARROW_RESOLUTION)];
	// Vector3[] _normals = new Vector3[CappedCylinderVertexCount(ARROW_RESOLUTION)];
	int[] _triangleIndices = new int[(ArrowheadTriangleCount(ARROW_RESOLUTION)+CappedCylinderTriangleCount(ARROW_RESOLUTION))*3];

	void Awake () {
		_mesh = new Mesh();
		_mesh.MarkDynamic();
		_meshFilter.mesh = _mesh;
	}

	void Update () {
		int vertOffset = 0;
		int indexOffset = 0;
		AppendArrowhead(vertexBuffer: _vertices, normalsBuffer: _normals, triangleIndexBuffer: _triangleIndices,
		                tipPos: Vector3.zero, length: 2f, diameter: 1f, startVertOffset: vertOffset, startIndexOffset: indexOffset, resolution: ARROW_RESOLUTION);
		vertOffset += ArrowheadVertexCount(ARROW_RESOLUTION);
		indexOffset += ArrowheadTriangleCount(ARROW_RESOLUTION)*3;

		AppendCappedCylinder(vertexBuffer: _vertices, normalsBuffer: _normals, triangleIndexBuffer: _triangleIndices,
		                 	tipPos: new Vector3(0f,-2f,0f), length: 4f, diameter: 0.5f, startVertOffset: vertOffset, startIndexOffset: indexOffset, resolution: ARROW_RESOLUTION);
		vertOffset += CappedCylinderVertexCount(ARROW_RESOLUTION);
		indexOffset += CappedCylinderTriangleCount(ARROW_RESOLUTION)*3;

		_mesh.vertices = _vertices;
		_mesh.normals = _normals;
		_mesh.triangles = _triangleIndices;
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
	static void AppendArrowhead (Vector3[] vertexBuffer, Vector3[] normalsBuffer, int[] triangleIndexBuffer,
	                             Vector3 tipPos, float length, float diameter, int startVertOffset, int startIndexOffset, int resolution) {
		vertexBuffer[startVertOffset] = tipPos;
		normalsBuffer[startVertOffset] = Vector3.up;
		
		// Based on http://slabode.exofire.net/circle_draw.shtml
		float theta = 2f * Mathf.PI/(float)resolution; 
		float c = Mathf.Cos(theta);//precalculate the sine and cosine
		float s = Mathf.Sin(theta);
		float t;

		float x = diameter/2f;//we start at angle = 0 
		float y = 0;

		for (int i = 0; i < resolution; i++) {
			var newVertPos = new Vector3(x, -length, y);
			vertexBuffer[startVertOffset+1+i] = newVertPos; // Part of arrow head
			normalsBuffer[startVertOffset+1+i] = Vector3.Cross((tipPos-newVertPos).normalized,Vector3.Cross(new Vector3(x, 0f, y), Vector3.up));
			// Debug.LogFormat(">{0}:",startOffset+1+i);
			// Debug.DrawRay(newVertPos, ((tipPos-newVertPos)).normalized, Color.red);
			// Debug.DrawRay(newVertPos, Vector3.Cross(new Vector3(x, 0f, y), Vector3.up), Color.green);
			// Debug.DrawRay(newVertPos, new Vector3(x, 0f, y), Color.blue);

			vertexBuffer[startVertOffset+1+resolution+i] = newVertPos; // Part of base
			normalsBuffer[startVertOffset+1+resolution+i] = Vector3.down;
			// Debug.LogFormat(">>{0}:",startOffset+1+resolution+i);
			// Debug.DrawRay(newVertPos, Vector3.down, Color.blue);
			
			//apply the rotation matrix
			t = x;
			x = c * x - s * y;
			y = s * t + c * y;
		} 

		vertexBuffer[startVertOffset+1+resolution+resolution] = new Vector3(0f, -length, 0f);
		normalsBuffer[startVertOffset+1+resolution+resolution] = Vector3.down;
		// Debug.LogFormat(">>>{0}:",startOffset+1+resolution+resolution);

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

	static void AppendCappedCylinder (Vector3[] vertexBuffer, Vector3[] normalsBuffer, int[] triangleIndexBuffer,
	                                  Vector3 tipPos, float length, float diameter, int startVertOffset, int startIndexOffset, int resolution) {
		vertexBuffer[startVertOffset] = tipPos;
		normalsBuffer[startVertOffset] = Vector3.up;
		
		// Based on http://slabode.exofire.net/circle_draw.shtml
		float theta = 2f * Mathf.PI/(float)resolution; 
		float c = Mathf.Cos(theta);//precalculate the sine and cosine
		float s = Mathf.Sin(theta);
		float t;

		float x = diameter/2f;//we start at angle = 0 
		float y = 0;

		for (int i = 0; i < resolution; i++) {
			var newVertPos = new Vector3(x, 0, y) + tipPos;
			vertexBuffer[startVertOffset+1+i] = newVertPos; // Part of top (cap)
			normalsBuffer[startVertOffset+1+i] = Vector3.up;

			vertexBuffer[startVertOffset+1+resolution+i] = newVertPos; // Top of cylinder
			normalsBuffer[startVertOffset+1+resolution+i] = new Vector3(x, 0f, y).normalized;


			newVertPos = new Vector3(x, -length, y) + tipPos;
			vertexBuffer[startVertOffset+1+resolution*2+i] = newVertPos; // Bottom of cylinder
			normalsBuffer[startVertOffset+1+resolution*2+i] = new Vector3(x, 0f, y).normalized;

			vertexBuffer[startVertOffset+1+resolution*3+i] = newVertPos; // Part of bottom (cap)
			normalsBuffer[startVertOffset+1+resolution*3+i] = Vector3.down;

			//apply the rotation matrix
			t = x;
			x = c * x - s * y;
			y = s * t + c * y;
		} 

		vertexBuffer[startVertOffset+1+resolution*4] = new Vector3(0f, -length, 0f) + tipPos;
		normalsBuffer[startVertOffset+1+resolution*4] = Vector3.down;
		// Debug.LogFormat(">>>{0}:",startOffset+1+resolution+resolution);

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

		// int baseIndex = startIndexOffset+(resolution-1)*3+3;
		// for (int i = 0; i < resolution; i++) {
		// 	triangleIndexBuffer[baseIndex+i*3] = startVertOffset+1+resolution+resolution;
		// 	triangleIndexBuffer[baseIndex+i*3+1] = startVertOffset+1+resolution+i;
		// 	triangleIndexBuffer[baseIndex+i*3+2] = startVertOffset+1+resolution+((i+1)%resolution);
		// }
	}

	void OnDrawGizmos () {
		// for (int i = 0; i < _triangleIndices.Length; i += 3) {
		// 	Debug.DrawLine(_vertices[_triangleIndices[i]],_vertices[_triangleIndices[i+1]], Color.red);
		// 	Debug.DrawLine(_vertices[_triangleIndices[i+1]],_vertices[_triangleIndices[i+2]], Color.green);
		// 	Debug.DrawLine(_vertices[_triangleIndices[i+2]],_vertices[_triangleIndices[i]], Color.blue);
		// }
		for (int i = 0; i < _vertices.Length; i++) {
			Debug.DrawRay(_vertices[i], _normals[i]*0.2f, Color.cyan);
			DrawDebugAxes(_vertices[i], 0.1f);
			DrawLabel(_vertices[i]+_normals[i]*0.2f, i);
		}
	}

	void DrawDebugAxes (Vector3 pos, float scale) {
		Debug.DrawLine(pos + Vector3.right * scale/2f, pos - Vector3.right * scale/2f);
		Debug.DrawLine(pos + Vector3.up * scale/2f, pos - Vector3.up * scale/2f);
		Debug.DrawLine(pos + Vector3.forward * scale/2f, pos - Vector3.forward * scale/2f);
	}

	void DrawLabel (Vector3 pos, int index) {
		Handles.Label( pos, index.ToString());
	}
}
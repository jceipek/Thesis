namespace Giverspace {
using UnityEngine;

[System.Serializable]
public struct ModelTypeToPrefab {
	public ModelType ModelType;
	public GameObject Prefab;
}

public class Model : MonoBehaviour {
	[SerializeField] ModelTypeToPrefab[] _modelTypesToPrefabs;

	static GameObject[] _prefabsForModels;
	GameObject[] _instancedModels;
	MeshRenderer[] _instancedRenderers;

	GameObject _model;
	MeshRenderer _meshRenderer;
	ModelType _modelType = ModelType.None;

	void Awake () {
		int maxIndex = -1;
		for (int i = 0; i < _modelTypesToPrefabs.Length; i++) {
			if ((int)_modelTypesToPrefabs[i].ModelType > maxIndex) {
				maxIndex = (int)_modelTypesToPrefabs[i].ModelType;
			}
		}
		_prefabsForModels = new GameObject[maxIndex+1];
		_instancedModels = new GameObject[maxIndex+1];
		_instancedRenderers = new MeshRenderer[maxIndex+1];
		for (int i = 0; i < _modelTypesToPrefabs.Length; i++) {
			_prefabsForModels[(int)_modelTypesToPrefabs[i].ModelType] = _modelTypesToPrefabs[i].Prefab;
		}
	}

	GameObject PrefabForModelType (ModelType modelType) {
		return _prefabsForModels[(int)modelType];
	}

	public void UpdateData (ModelType modelType, Vector3 position, Quaternion rotation, Vector3 scale, Color32 tint, bool visible = true) {
		if (_modelType != modelType) {
			if (_model != null) {
				_model.SetActive(false);
			}
			_modelType = modelType;
			if (_instancedModels[(int)modelType] == null) {
				_model = Instantiate(PrefabForModelType(modelType), Vector3.zero, Quaternion.identity) as GameObject;
				_model.transform.SetParent(transform, worldPositionStays: false);
				_instancedModels[(int)modelType] = _model;
				_instancedRenderers[(int)modelType] = _model.GetComponent<MeshRenderer>();
				_meshRenderer = _instancedRenderers[(int)modelType];
			} else {
				_model = _instancedModels[(int)modelType];
				_meshRenderer = _instancedRenderers[(int)modelType];
				_model.SetActive(true);
			}
		}
		if (visible) {
			// TODO(JULIAN): Make a more informed decision as to whether tinting is allowed 
			if (_modelType == ModelType.Cube || _modelType == ModelType.Cylinder || _modelType == ModelType.Sphere) {
				_meshRenderer.material.color = tint;
			}
			transform.position = position;
			transform.rotation = rotation;
			transform.rotation = rotation;
			transform.localScale = scale;
		}
		gameObject.SetActive(visible);
	}
}

}
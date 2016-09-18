using UnityEngine;

public enum ModelType {
  HEADSET = 0,
  BASIC_CONTROLLER = 1,
  CUBE = 2
}

public class Model : MonoBehaviour {

	public void UpdateData (ModelType modelType, Vector3 position, Quaternion rotation, Vector3 scale) {
		// TODO(JULIAN): Make model type do something!!!
		transform.position = position;
		transform.rotation = rotation;
		transform.rotation = rotation;
		transform.localScale = scale;
	}
}

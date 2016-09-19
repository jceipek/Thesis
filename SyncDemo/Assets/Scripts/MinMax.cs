using UnityEngine;

[System.Serializable]
public struct MinMax {
    [SerializeField] float _min;
    public float Min {
        get {
            return _min;
        }
    }
    [SerializeField] float _max;
    public float Max {
        get {
            return _max;
        }
    }
	public MinMax (float min, float max) {
		_min = min;
		_max = max;
	}
}
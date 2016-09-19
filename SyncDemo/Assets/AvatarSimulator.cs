using UnityEngine;

public class AvatarSimulator : MonoBehaviour {
	[SerializeField] Transform[] _eyeballs = new Transform[2];
	[SerializeField] Transform[] _eyelids = new Transform[2];
	Vector3[] _eyeballOrigins;
	bool _hasBeenInitialized = false;
	[SerializeField] float _eyeballBoundaryRadius;

	Vector3 _oldForward;
	Vector3 _oldRight;
	Vector3 _oldUp;
	[SerializeField] Vector3 _rotation = new Vector3(0f,10f,0f);
	[SerializeField] float _eyeMovementAmplifier = 1f;
	[SerializeField] int _smoothingSamples = 3;
	

	enum BlinkState {
		Waiting, Blinking
	}

	[SerializeField, CurveRange] AnimationCurve _blinkCurve;
	[SerializeField] float _blinkDuration = 0.1f;
	[SerializeField] MinMax _randomBlinkChance = new MinMax(.3f, 1f);
	float _blinkTimer = 0f;
	BlinkState _blinkState = BlinkState.Waiting;

	Vector3 _movingAverageOffset = Vector3.zero;
	void Update () {
		if (!_hasBeenInitialized) {
			return;
		}
		var inDirOfNew = (transform.forward - _oldForward);

		var newPos = new Vector3(Vector3.Dot(inDirOfNew, (transform.right+_oldRight)/2f),
						         0f,
								 Vector3.Dot(inDirOfNew, (transform.up+_oldUp)/2f)); 

		_movingAverageOffset = _movingAverageOffset + Vector3.ClampMagnitude(newPos*_eyeMovementAmplifier, _eyeballBoundaryRadius) - _movingAverageOffset/_smoothingSamples; 

		UpdateLookOffset(_movingAverageOffset/_smoothingSamples);

		_oldForward = transform.forward;
		_oldRight = transform.right;
		_oldUp = transform.up;

		transform.Rotate(_rotation*Time.deltaTime);

		switch (_blinkState) {
			case BlinkState.Waiting:
				_blinkTimer -= Time.deltaTime;
				if (_blinkTimer <= 0f) {
					_blinkState = BlinkState.Blinking;
					_blinkTimer = _blinkDuration;
				}
				break;
			case BlinkState.Blinking:
				_blinkTimer -= Time.deltaTime;
				if (_blinkTimer <= 0f) {
					_blinkState = BlinkState.Waiting;
					_blinkTimer = Random.Range(_randomBlinkChance.Min, _randomBlinkChance.Max);
					UpdateEyelids(1f);
				} else {
					UpdateEyelids(_blinkCurve.Evaluate(1f-_blinkTimer/_blinkDuration));
				}
				break;
		}


	}

	void UpdateLookOffset (Vector3 offset) {
		for (int i = 0; i < _eyeballs.Length; i++) {
			_eyeballs[i].localPosition = _eyeballOrigins[i] + offset; 
		}
	}

	void UpdateEyelids (float closePercentage) {
		foreach (var eyelid in _eyelids) {
			eyelid.localScale = new Vector3(1f, 1f, closePercentage);
		}
	}

	void Init () {
		_eyeballOrigins = new Vector3[_eyeballs.Length];
		for (int i = 0; i < _eyeballs.Length; i++) {
			_eyeballOrigins[i] = _eyeballs[i].localPosition;
		}
		_oldForward = transform.forward;
		_oldRight = transform.right;
		_oldUp = transform.up;

		_hasBeenInitialized = true;
	}

	void OnDrawGizmos () {
		if (!_hasBeenInitialized) {
			Init();
		}
		Gizmos.color = Color.green;
		for (int i = 0; i < _eyeballOrigins.Length; i++) {
			Gizmos.DrawWireSphere(_eyeballOrigins[i], _eyeballBoundaryRadius);
		}
	}
}
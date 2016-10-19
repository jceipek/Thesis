namespace Giverspace {
	using UnityEngine;

	public class ReadTime : MonoBehaviour {

		[SerializeField] TextMesh _textDisplay;

		void Update () {
			var time = System.TimeSpan.FromSeconds(MessageHandler._simulationTime);
			_textDisplay.text = string.Format("{0:D2}:{1:D2}:{2:D2}",  
												time.Minutes, 
												time.Seconds, 
												time.Milliseconds/10);
		}
	}
}
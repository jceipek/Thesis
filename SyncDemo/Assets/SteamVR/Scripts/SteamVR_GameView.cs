// Hololens compatibility:
#if (UNITY_STANDALONE_WIN && !UNITY_EDITOR) && !UNITY_WSA_10_0
//======= Copyright (c) Valve Corporation, All rights reserved. ===============
//
// Purpose: Handles rendering to the game view window
//
//=============================================================================

using UnityEngine;

[ExecuteInEditMode]
public class SteamVR_GameView : MonoBehaviour
{
	void Awake()
	{
		Debug.Log("SteamVR_GameView is deprecated in Unity 5.4 - REMOVING");
		DestroyImmediate(this);
	}
}


#endif

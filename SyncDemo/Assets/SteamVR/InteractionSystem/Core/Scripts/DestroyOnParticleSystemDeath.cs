// Hololens Compatibility:
#if UNITY_STANDALONE_WIN && !UNITY_WSA_10_0
//======= Copyright (c) Valve Corporation, All rights reserved. ===============
//
// Purpose: Destroys this object when its particle system dies
//
//=============================================================================

using UnityEngine;
using System.Collections;

namespace Valve.VR.InteractionSystem
{
	//-------------------------------------------------------------------------
	[RequireComponent( typeof( ParticleSystem ) )]
	public class DestroyOnParticleSystemDeath : MonoBehaviour
	{
		private ParticleSystem particles;

		//-------------------------------------------------
		void Awake()
		{
			particles = GetComponent<ParticleSystem>();

			InvokeRepeating( "CheckParticleSystem", 0.1f, 0.1f );
		}


		//-------------------------------------------------
		private void CheckParticleSystem()
		{
			if ( !particles.IsAlive() )
			{
				Destroy( this.gameObject );
			}
		}
	}
}

#endif

import { MESSAGE_TYPE, MODEL_TYPE, CONTROLLER_ATTACHMENT_TYPE, GIZMO_VISUALS_FLAGS } from './protocol'
import { vec3 as Vec3, quat as Quat } from 'gl-matrix'
import { ISpatialHash } from './spatialHash'

export type IVector3 = Vec3;
export type IQuaternion = Quat;
export type IColor = Uint8Array;

export const enum VOLUME_TYPE {
  SPHERE
, NONE
}

export const enum SIMULATION_TYPE {
  PAUSED = 0
, FWD_ONE = 1
, FWD_CONT = 2
}

export interface IState {
  globalTime: number;
  simulationTime: number;
  simulating: SIMULATION_TYPE;
  inProgressAlterations: IAlteration[]

  entities: IEntityList;
  storedEntities: IEntityList;
  models: IEntityList;
  clock: IClock;
  oven: IOven;
  shelf: IShelf;
  // latestEntityId: number;
  segments: ISegment[]
}

export interface ITransientState {
  inputData: Map<string,IInputData>;
}

export interface IEntityList {
  entities: IEntity[];
  offsetPos: IVector3;
  offsetRot: IQuaternion;
  spatialHash: ISpatialHash<IEntity>;
}

export interface IEntity {
  type: MODEL_TYPE;
  id: number;
  pos: IVector3;
  rot: IQuaternion;
  scale: IVector3;
  visible: boolean;
  tint: IColor;
  gizmoVisuals: GIZMO_VISUALS_FLAGS;

  interactionVolume: IInteractionVolume;
  children: IEntityList;
  deleted: boolean;
}

export interface ISegment {
  id: number;
  start: IVector3;
  end: IVector3;
  color: IColor;
}

export interface IInteractionVolume {
  type: VOLUME_TYPE;
}

export interface ISphereInteractionVolume extends IInteractionVolume {
  radius: number;
}

export interface IButtonState {
  curr: 0|1;
  last: 0|1;
}

export interface IHeadset {
  id : number;
  pos : IVector3;
  rot: IQuaternion;
}

export interface IController {
  id : number;
  attachmentId : number;
  pos : IVector3;
  interactionVolume: IInteractionVolume;
  rot: IQuaternion;
  grab: IButtonState;
  action0: IButtonState;

  ignore: boolean;

  attachment: CONTROLLER_ATTACHMENT_TYPE;
}

export interface IInputData {
  headset: IHeadset;
  controllers: IController[];
}

// RULES

export interface IRule {
  conditions: ICondition[];
  actions: IAction[];
  entities: IEntityList;
}

// CONDITIONS

export const enum CONDITION_TYPE {
  PRESENT, INTERSECT
}

export interface ICondition {
  type: CONDITION_TYPE;
}

export type IEntitySymbol = number;

export interface IEntityIdentifier {
  type: MODEL_TYPE;
}

export interface IConditionPresent extends ICondition {
  entityIdentifier: IEntityIdentifier;
}

export interface IConditionIntersect extends ICondition {
  // entityA: IEntity;
  // entityB: IEntity;
  entityIdentifierA: IEntityIdentifier;
  entityIdentifierB: IEntityIdentifier;
}

// ALTERATIONS

export const enum ALTERATION_TYPE {
  MOVE
, DELETE
, DUPLICATE
}

export interface IAlteration {
  type: ALTERATION_TYPE;
  valid: boolean;
  entitiesList: IEntityList;
}

export interface IControllerMetadata {
  controller: IController;
  entityStartPos: IVector3;
  entityStartRot: IQuaternion;
  offsetPos: IVector3;
  offsetRot: IQuaternion;
}

export interface IAlterationMove extends IAlteration {
  entity: IEntity;
  controllerMetadata: IControllerMetadata;
  constraint: GIZMO_VISUALS_FLAGS;
}

export interface IAlterationDuplicate extends IAlteration {
  entity: IEntity;
  entityCopy: IEntity;
  controllerMetadata: IControllerMetadata;
}

export interface IAlterationDelete extends IAlteration {
  entity: IEntity;
  controllerMetadata : IControllerMetadata;
}

// ACTIONS

export const enum ACTION_TYPE {
  MOVE_BY, DELETE, DUPLICATE
}

export interface IAction {
  type: ACTION_TYPE;
}

export interface IActionWithEntity extends IAction {
  type: ACTION_TYPE;
  entity: IEntity;
}

export interface IActionMoveBy extends IActionWithEntity {
  posOffset: IVector3;
  rotOffset: IQuaternion;
}

export interface IActionDuplicate extends IActionWithEntity {
  posOffset: IVector3;
  rotOffset: IQuaternion;
}

export interface IActionDelete extends IActionWithEntity {
}


// OBJECTS

export interface IOven {
  model: IEntity;
  buttonStates: Map<MODEL_TYPE, IButtonState>;
  buttonModels: Map<MODEL_TYPE, IEntity>;
  rules: IRule[];

  // Temp stuff relating to curr rule:
  actionIndex: number;
  lastRule: IRule;
  currRule: IRule;
  currRuleSymbolMap: ISymbolMap;
  currRuleEntities: IEntityList;
}

export interface ISymbolMap {
  [index: number]: IEntity;
  length: number;
}

export interface IShelf {
  model: IEntity;
  clonableModels: IEntityList;
}

export interface IClock {
  model: IEntity;
  buttonStates: Map<MODEL_TYPE, IButtonState>;
  buttonModels: Map<MODEL_TYPE, IEntity>;
}
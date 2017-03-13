import {
  IState
, IEntityList
, IEntity
} from './interface'

export const PERFORMANCE_TRACKER = {currFrame: 0}; // {frame# -> {computeTime, transferTime, objectCount}}

export function nanosecondsFromElapsedDelta (elapsedDelta : [number, number]) {
  return elapsedDelta[0] * 1e9 + elapsedDelta[1];
}

function countObjectsInEntityList (entityList : IEntityList) : number {
  let count = 0;
  for (let entity of entityList.entities) {
    count++;
    count += countObjectsInEntityList(entity.children);
  }
  return count;
}

export function countObjects (state: IState) : number {
  let count = countObjectsInEntityList(state.models) + countObjectsInEntityList(state.entities);
  count += countObjectsInEntityList(state.oven.currRuleEntities);
  return count;
}
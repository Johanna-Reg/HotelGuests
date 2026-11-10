/**
 * The ad's canvas and frame loop live in `@gameengine/playable/stage`, so fixes there reach every ad
 * (the canvas stops at 2x density and draws at most 60 fps by default; `StageOptions` changes both).
 */
export { createStage, type Stage, type StageOptions } from '@gameengine/playable/stage';

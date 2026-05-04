// Maps `/api/scene-config` plus optional `/api/progress` and `/api/daily`
// into the scene and level view models. This is read-only display
// shaping; media, analyze, scoring, and unlock mutations remain out of scope.
const LEVEL_LABELS = {
  1: 'Beginner',
  2: 'Intermediate',
  3: 'Advanced',
};

function buildLevelMap(levels = []) {
  return levels.reduce((map, levelDef) => {
    (levelDef.scenes || []).forEach((sceneId) => {
      map[sceneId] = levelDef.level;
    });
    return map;
  }, {});
}

function buildLevelSceneMeta(levels = []) {
  return levels.reduce((map, levelDef) => {
    const sceneIds = levelDef.scenes || [];
    const totalScenes = sceneIds.length;

    sceneIds.forEach((sceneId, index) => {
      map[sceneId] = {
        levelSceneNumber: index + 1,
        levelSceneCount: totalScenes,
        nextLevelSceneId: sceneIds[index + 1] || '',
      };
    });

    return map;
  }, {});
}

function formatRuntime(scene) {
  const start = Number(scene?.ui?.clip_start || 0);
  const end = Number(scene?.ui?.clip_end || 0);
  const seconds = Math.max(0, end - start);

  if (!seconds) {
    return 'Clip';
  }

  return `${seconds}s`;
}

function posterFallback(level) {
  if (level === 1) return '/static/beginner-card.jpg';
  if (level === 2) return '/static/intermediate-card.jpg';
  return '/static/advanced-card.jpg';
}

export function adaptSceneConfig(rawConfig, { progress = null, daily = null } = {}) {
  const levelMap = buildLevelMap(rawConfig?.levels || []);
  const levelSceneMeta = buildLevelSceneMeta(rawConfig?.levels || []);
  const unlocked = new Set(progress?.unlocked_scenes || []);
  const hasProgress = !!progress;

  const scenes = Object.entries(rawConfig?.scenes || {}).map(([id, scene]) => {
    const level = levelMap[id] || 1;
    const personalBest = progress?.best_scores?.[id];

    return {
      id,
      title: scene.movie,
      film: scene.movie,
      year: scene.year,
      quote: scene.quote,
      actor: scene.actor,
      level,
      levelName: LEVEL_LABELS[level] || `Level ${level}`,
      difficulty: scene.difficulty || LEVEL_LABELS[level] || 'Scene',
      runtime: formatRuntime(scene),
      targetScore: level > 1 ? 70 : 60,
      personalBest: personalBest ? Math.round(personalBest) : null,
      locked: hasProgress ? !unlocked.has(id) : false,
      isDaily: daily?.scene_id === id,
      levelSceneNumber: levelSceneMeta[id]?.levelSceneNumber || 1,
      levelSceneCount: levelSceneMeta[id]?.levelSceneCount || 1,
      nextLevelSceneId: levelSceneMeta[id]?.nextLevelSceneId || '',
      tags: [scene.actor, scene.difficulty].filter(Boolean),
      imageUrl: scene?.ui?.poster_image || posterFallback(level),
      source: scene,
    };
  });

  const levels = (rawConfig?.levels || []).map((levelDef) => {
    const sceneIds = levelDef.scenes || [];
    const unlockedScenes = hasProgress
      ? sceneIds.filter((sceneId) => unlocked.has(sceneId)).length
      : sceneIds.length;

    return {
      id: `level-${levelDef.level}`,
      level: levelDef.level,
      title: LEVEL_LABELS[levelDef.level] || `Level ${levelDef.level}`,
      description: levelDef.level === 1
        ? 'Start with the first available scenes.'
        : levelDef.level === 2
          ? 'Unlocked after the early scene path.'
          : 'Higher-level scenes in the catalog.',
      status: hasProgress && unlockedScenes === 0 ? 'locked' : hasProgress && unlockedScenes === sceneIds.length ? 'complete' : 'active',
      unlockedScenes,
      totalScenes: sceneIds.length,
      requiredScore: levelDef.unlock_score || 0,
      firstUnlockedSceneId: sceneIds.find((sceneId) => !hasProgress || unlocked.has(sceneId)) || sceneIds[0],
    };
  });

  return { scenes, levels };
}

export function findSceneById(scenes, sceneId) {
  return scenes.find((scene) => scene.id === sceneId) || null;
}

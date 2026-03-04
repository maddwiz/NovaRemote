import { VrLayoutPreset, VrPanelState } from "./contracts";

function baseTransform(index: number) {
  return {
    x: 0,
    y: 1.45,
    z: -1.8,
    yaw: 0,
    pitch: 0,
    roll: 0,
    width: 1.05,
    height: 0.62,
    index,
  };
}

export function buildPresetLayout(preset: VrLayoutPreset, panels: VrPanelState[]): VrPanelState[] {
  if (panels.length === 0 || preset === "custom") {
    return panels;
  }

  if (preset === "arc") {
    const step = panels.length <= 1 ? 0 : 52 / (panels.length - 1);
    return panels.map((panel, index) => {
      const t = baseTransform(index);
      const yaw = -26 + step * index;
      const radians = (yaw * Math.PI) / 180;
      return {
        ...panel,
        transform: {
          ...panel.transform,
          x: Math.sin(radians) * 0.95,
          y: t.y,
          z: -1.75 - Math.cos(radians) * 0.12,
          yaw,
        },
      };
    });
  }

  if (preset === "grid") {
    const columns = panels.length <= 4 ? 2 : 3;
    const spacingX = 0.9;
    const spacingY = 0.66;
    return panels.map((panel, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const centerOffset = ((columns - 1) * spacingX) / 2;
      return {
        ...panel,
        transform: {
          ...panel.transform,
          x: col * spacingX - centerOffset,
          y: 1.7 - row * spacingY,
          z: -2,
          yaw: 0,
        },
      };
    });
  }

  if (preset === "stacked") {
    return panels.map((panel, index) => ({
      ...panel,
      transform: {
        ...panel.transform,
        x: 0,
        y: 1.85 - index * 0.46,
        z: -1.9,
        yaw: 0,
      },
    }));
  }

  return panels.map((panel, index) => {
    const t = baseTransform(index);
    const side = index % 2 === 0 ? -1 : 1;
    const tier = Math.floor(index / 2);
    return {
      ...panel,
      transform: {
        ...panel.transform,
        x: side * (0.56 + tier * 0.22),
        y: t.y - tier * 0.16,
        z: -1.55 - tier * 0.12,
        yaw: side * -18,
      },
    };
  });
}

import {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  KeyUpEvent,
  SingletonAction,
  WillAppearEvent,
} from "@elgato/streamdeck";
import fetch from "node-fetch";
import { promisify } from "util";
import { execFile } from "child_process";
import { PNG } from "pngjs";

const execFileAsync = promisify(execFile);

/**
 * An example action class that displays a count that increments by one each time the button is pressed.
 */
@action({ UUID: "com.tijme.tijmes-plugin.light" })
export class Light extends SingletonAction<LightSettings> {
  /**
   * The {@link SingletonAction.onWillAppear} event is useful for setting the visual representation of an action when it become visible. This could be due to the Stream Deck first
   * starting up, or the user navigating between pages / folders etc.. There is also an inverse of this event in the form of {@link streamDeck.client.onWillDisappear}. In this example,
   * we're setting the title to the "count" that is incremented in {@link IncrementCounter.onKeyDown}.
   */
  onWillAppear(ev: WillAppearEvent<LightSettings>): void | Promise<void> {
    // return ev.action.setTitle(ev.action.getSettings().color);
    ev.action.getSettings().then((settings) => {
      setTitle(settings, ev.action.setTitle.bind(ev.action));
      ev.action.setImage(createPngBase64(settings.colorRgb));
    });
  }

  async onKeyDown(ev: KeyDownEvent<LightSettings>): Promise<void> {
    let settings = await ev.action.getSettings();
    ev.action.setSettings({ ...settings, isDown: true });

    await new Promise((resolve) => setTimeout(resolve, settings.delay));

    settings = await ev.action.getSettings();

    if (!settings.isDown) return;
    ev.action.setSettings({ ...settings, longPress: true });

    changeLampColor(settings.colorRgb, settings);
  }

  /**
   * Listens for the {@link SingletonAction.onKeyDown} event which is emitted by Stream Deck when an action is pressed. Stream Deck provides various events for tracking interaction
   * with devices including key down/up, dial rotations, and device connectivity, etc. When triggered, {@link ev} object contains information about the event including any payloads
   * and action information where applicable. In this example, our action will display a counter that increments by one each press. We track the current count on the action's persisted
   * settings using `setSettings` and `getSettings`.
   */
  async onKeyUp(ev: KeyUpEvent<LightSettings>): Promise<void> {
    // Determine the current count from the settings.
    const settings = await ev.action.getSettings();
    await ev.action.setSettings({ ...settings, isDown: false });
    if (!settings.longPress) {
      const { stdout } = await execFileAsync("pick-color.exe");

      const color = JSON.parse(stdout.trim());

      changeLampColor(color, settings);

      // rgb to hex
      const hex =
        "#" +
        ((1 << 24) + (color[0] << 16) + (color[1] << 8) + color[2])
          .toString(16)
          .slice(1)
          .toUpperCase();

      ev.action.setSettings({
        ...settings,
        isDown: false,
        colorHex: hex,
        longPress: false,
        colorRgb: color,
      });

      setTitle(settings, ev.action.setTitle.bind(ev.action));

      const img = createPngBase64(color);
      ev.action.setImage(img);
    } else {
      ev.action.setSettings({ ...settings, longPress: false });
    }
  }

  onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<LightSettings>
  ): Promise<void> | void {
    setTitle(ev.payload.settings, ev.action.setTitle.bind(ev.action));
  }
}

function setTitle(settings: LightSettings, change: Function) {
  if (settings.showValue === "hex" && settings.colorHex) {
    change(settings.colorHex);
  } else if (settings.showValue === "rgb" && settings.colorRgb) {
    change(settings.colorRgb.toString());
  } else {
    change("Color\nPicker");
  }
}

/**
 * Settings for {@link Light}.
 */
type LightSettings = {
  colorHex: string;
  colorRgb: number[];
  isDown: boolean;
  longPress: boolean;
  delay: number;
  showValue: "hex" | "rgb" | "none";
  lights: string; // comma separated list of lights
  url: string;
  token: string;
};

function createPngBase64([r, g, b]: number[]) {
  const width = 128;
  const height = 128;

  const png = new PNG({
    width: width,
    height: height,
    colorType: 2, // truecolor
  });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255; // Alpha channel
    }
  }

  const buffer = PNG.sync.write(png);

  return "data:image/png;base64," + buffer.toString("base64");
}

function changeLampColor(color: number[], settings: LightSettings) {
  const url = settings.url; // Replace with your actual URL
  const token = settings.token; // Replace with your actual Bearer token

  for (const light of settings.lights.split(/,( )?/)) {
    const body = {
      entity_id: light, // Replace with your actual entity_id
      rgb_color: color,
    };

    fetch(url + "/api/services/light/turn_on", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
      .then((response) => response.json())
      .then((data) => {})
      .catch((error) => {
        console.error("Error:", error);
      });
  }
}

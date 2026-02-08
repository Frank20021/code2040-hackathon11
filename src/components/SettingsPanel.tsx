import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

export type FacingMode = "user" | "environment";

export type SettingsState = {
  facingMode: FacingMode;
  smoothingWindow: number;
  deadzoneMultiplier: number;
  showOverlay: boolean;
};

export default function SettingsPanel({
  settings,
  onChange
}: {
  settings: SettingsState;
  onChange: (next: SettingsState) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <div className="text-base font-medium text-foreground">Facing mode</div>
            <div className="text-sm text-muted">
              Front camera for iPad is usually best.
            </div>
          </div>
          <div className="w-44">
            <Select
              value={settings.facingMode}
              onValueChange={(value) =>
                onChange({ ...settings, facingMode: value as FacingMode })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Front (user)</SelectItem>
                <SelectItem value="environment">Back (environment)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <div className="text-base font-medium text-foreground">Smoothing window</div>
            <div className="text-sm text-muted">
              Majority vote over the last N frames.
            </div>
          </div>
          <div className="w-44">
            <Slider
              value={[settings.smoothingWindow]}
              min={1}
              max={15}
              step={1}
              onValueChange={([value]) =>
                onChange({ ...settings, smoothingWindow: value })
              }
            />
            <div className="mt-1 text-right text-sm text-muted">
              {settings.smoothingWindow}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <div className="text-base font-medium text-foreground">Deadzone multiplier</div>
            <div className="text-sm text-muted">
              Larger means more stable CENTER.
            </div>
          </div>
          <div className="w-44">
            <Slider
              value={[settings.deadzoneMultiplier]}
              min={1}
              max={4}
              step={0.25}
              onValueChange={([value]) =>
                onChange({ ...settings, deadzoneMultiplier: value })
              }
            />
            <div className="mt-1 text-right text-sm text-muted">
              {settings.deadzoneMultiplier.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <div className="text-base font-medium text-foreground">Debug overlay</div>
            <div className="text-sm text-muted">Landmarks + iris centers.</div>
          </div>
          <Switch
            checked={settings.showOverlay}
            onCheckedChange={(checked) =>
              onChange({ ...settings, showOverlay: checked })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

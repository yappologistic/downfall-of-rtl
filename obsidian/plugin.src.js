/* global DownfallOfRTL */
// Obsidian plugin. Counters esm7/obsidian-rtl, Smart RTL, and Obsidian's own
// built-in "Right-to-left (RTL)" setting, which we turn off on load. Out of spite.
// Build with `npm run build`; this source is bundled with src/core.js into main.js.
const { Plugin, PluginSettingTab, Setting, Notice } = require('obsidian');

const DEFAULTS = { level: 'spicy', disableBuiltInRtl: true };

module.exports = class DownfallOfRtlPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new DownfallSettingTab(this.app, this));
    this.status = this.addStatusBarItem();
    this.app.workspace.onLayoutReady(() => this.unleash());

    this.addCommand({
      id: 'cycle-level',
      name: 'Cycle aggression level (polite → spicy → nuclear)',
      callback: async () => {
        const L = DownfallOfRTL.LEVELS;
        this.settings.level = L[(L.indexOf(this.settings.level) + 1) % L.length];
        await this.saveData(this.settings);
        this.unleash();
        new Notice(`Downfall of RTL: ${this.settings.level}`);
      },
    });
  }

  unleash() {
    if (this.engine) this.engine.surrender();
    if (this.settings.disableBuiltInRtl) {
      try {
        // Undocumented, but so is the war.
        if (this.app.vault.getConfig('rightToLeft')) {
          this.app.vault.setConfig('rightToLeft', false);
          new Notice('Downfall of RTL: turned off "Right-to-left (RTL)". You are welcome.');
        }
      } catch (_) { /* API moved; the CSS still wins */ }
    }
    this.engine = DownfallOfRTL.unleash({
      level: this.settings.level,
      doc: document,
      onStats: (_, total) => this.status.setText(`→ ${total} RTL neutralized`),
    });
    this.status.setText(`→ LTR (${this.settings.level})`);
  }

  onunload() {
    if (this.engine) this.engine.surrender();
  }
};

class DownfallSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Downfall of RTL' });
    containerEl.createEl('p', { text: 'Text goes left to right. That is it.' });

    new Setting(containerEl)
      .setName('Aggression level')
      .setDesc('Polite: LTR direction. Spicy: also Comic Sans instead of Vazirmatn and RTL mark flipping (outside the editor). Nuclear: every glyph left to right, mirrored.')
      .addDropdown((d) =>
        d
          .addOptions({ polite: 'Polite', spicy: 'Spicy', nuclear: 'Nuclear ☢' })
          .setValue(this.plugin.settings.level)
          .onChange(async (v) => {
            this.plugin.settings.level = v;
            await this.plugin.saveData(this.plugin.settings);
            this.plugin.unleash();
          })
      );

    new Setting(containerEl)
      .setName('Disable Obsidian\'s built-in RTL setting')
      .setDesc('Turns off Settings → Editor → Right-to-left (RTL) whenever the plugin loads.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.disableBuiltInRtl).onChange(async (v) => {
          this.plugin.settings.disableBuiltInRtl = v;
          await this.plugin.saveData(this.plugin.settings);
        })
      );
  }
}

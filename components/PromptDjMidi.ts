/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { classMap } from 'lit/directives/class-map.js';

import { throttle } from '../utils/throttle';

import './PromptController';
import './PlayPauseButton';
import type { PlaybackState, Prompt } from '../types';
import { MidiDispatcher } from '../utils/MidiDispatcher';

type DefaultPrompt = { color: string; text: string };

/** The main component for adding and controlling prompts. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  static override styles = css`
    :host {
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      box-sizing: border-box;
      position: relative;
      padding: 2vmin;
    }
    #background {
      will-change: background-image;
      position: absolute;
      height: 100%;
      width: 100%;
      z-index: -1;
      background: #111;
      transition: background-image 0.1s linear;
    }
    #top-bar {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 0 1vmin;
    }
    #top-controls {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px;
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      align-items: flex-start;
    }
    #top-controls > div {
       display: flex;
       gap: 10px;
       align-items: center;
    }
    #top-controls label {
      font-weight: 500;
      color: #fff;
    }
    #soundscape {
      position: relative;
      width: clamp(300px, 80vw, 1200px);
      height: 65vh;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.1);
      margin: 2vmin 0;
      transition: all 0.5s cubic-bezier(0.25, 1, 0.5, 1);
      overflow: hidden;
    }
    #soundscape.empty {
      width: 3vmin;
      height: 3vmin;
      min-width: 30px;
      min-height: 30px;
      border-radius: 50%;
      padding: 0;
      margin: 0;
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.5);
      position: absolute;
      top: 55%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    play-pause-button {
      width: 15vmin;
      min-width: 100px;
      max-width: 140px;
      flex-shrink: 0;
    }
    #midi-controls {
      display: flex;
      gap: 5px;
      align-items: center;
    }
    button, .button {
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: #0002;
      -webkit-font-smoothing: antialiased;
      border: 1.5px solid #fff;
      border-radius: 4px;
      user-select: none;
      padding: 5px 10px;
      &.active {
        background-color: #fff;
        color: #000;
      }
    }
    select {
      font: inherit;
      padding: 5px;
      background: #0002;
      color: #fff;
      border-radius: 4px;
      border: 1.5px solid #fff;
      outline: none;
      cursor: pointer;
    }
    option {
      color: #000;
      background: #fff;
    }
  `;

  private prompts: Map<string, Prompt>;
  private midiDispatcher: MidiDispatcher;
  private allPrompts: DefaultPrompt[];
  private static nextCC = 0;

  @query('#prompt-select') private promptSelect!: HTMLSelectElement;
  @query('#soundscape') private soundscapeEl!: HTMLElement;

  @property({ type: Boolean }) private showMidi = false;
  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() public audioLevel = 0;
  @state() private midiInputIds: string[] = [];
  @state() private activeMidiInputId: string | null = null;
  @state() private availablePrompts: DefaultPrompt[];

  @property({ type: Object })
  private filteredPrompts = new Set<string>();

  constructor(initialPrompts: Map<string, Prompt>, allPrompts: DefaultPrompt[]) {
    super();
    this.prompts = initialPrompts;
    this.allPrompts = allPrompts;
    this.midiDispatcher = new MidiDispatcher();
    this.availablePrompts = this.getAvailablePrompts();
  }

  private getAvailablePrompts() {
    return this.allPrompts.filter(p => !this.prompts.has(p.text));
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const updatedPrompt = e.detail;
    this.prompts.set(updatedPrompt.promptId, updatedPrompt);
    this.dispatchPromptsChanged();
    this.requestUpdate();
  }

  private handlePromptRemoved(e: CustomEvent<string>) {
    const promptIdToRemove = e.detail;
    this.prompts.delete(promptIdToRemove);
    this.availablePrompts = this.getAvailablePrompts();
    this.dispatchPromptsChanged();
    this.requestUpdate();
  }

  private handleAddPrompt() {
    const text = this.promptSelect.value;
    if (!text || this.prompts.has(text)) return;

    const defaultPrompt = this.allPrompts.find(p => p.text === text);
    if (!defaultPrompt) return;

    const newPrompt: Prompt = {
      promptId: text,
      text: text,
      weight: 0,
      cc: PromptDjMidi.nextCC++,
      color: defaultPrompt.color,
      x: this.soundscapeEl.offsetWidth / 2,
      y: this.soundscapeEl.offsetHeight / 2,
    };

    this.prompts.set(newPrompt.promptId, newPrompt);
    this.availablePrompts = this.getAvailablePrompts();
    this.dispatchPromptsChanged();
    this.requestUpdate();
  }

  private dispatchPromptsChanged() {
     this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: new Map(this.prompts) }),
    );
  }

  /** Generates radial gradients for each prompt based on weight and color. */
  private readonly makeBackground = throttle(() => {
    const bg: string[] = [];
    const activePrompts = [...this.prompts.values()].filter(p => p.weight > 0);

    activePrompts.forEach((p) => {
      const alphaPct = Math.min(p.weight, 1) * 0.4; // Max alpha 0.4
      const alpha = Math.round(alphaPct * 255).toString(16).padStart(2, '0');
      const stop = p.weight / 2;
      const x = 20 + Math.random() * 60;
      const y = 20 + Math.random() * 60;
      const s = `radial-gradient(circle at ${x}% ${y}%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 40}vmax)`;
      bg.push(s);
    });

    return bg.join(', ');
  }, 30);

  private toggleShowMidi() {
    return this.setShowMidi(!this.showMidi);
  }

  public async setShowMidi(show: boolean) {
    this.showMidi = show;
    if (!this.showMidi) return;
    try {
      const inputIds = await this.midiDispatcher.getMidiAccess();
      this.midiInputIds = inputIds;
      this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
    } catch (e: any) {
      this.showMidi = false;
      this.dispatchEvent(new CustomEvent('error', {detail: e.message}));
    }
  }

  private handleMidiInputChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newMidiId = selectElement.value;
    this.activeMidiInputId = newMidiId;
    this.midiDispatcher.activeMidiInputId = newMidiId;
  }

  private playPause() {
    this.dispatchEvent(new CustomEvent('play-pause'));
  }

  public addFilteredPrompt(prompt: string) {
    this.filteredPrompts = new Set([...this.filteredPrompts, prompt]);
  }

  override render() {
    const bg = styleMap({
      backgroundImage: this.makeBackground(),
    });
    const soundscapeClasses = classMap({ empty: this.prompts.size === 0 });

    return html`<div id="background" style=${bg}></div>
      <div id="top-bar">
        <div id="top-controls">
          <label for="prompt-select">Music Selector</label>
          <div>
            <select id="prompt-select">
              ${this.availablePrompts.map(p => html`<option value=${p.text}>${p.text}</option>`)}
            </select>
            <div class="button" @click=${this.handleAddPrompt}>Add</div>
          </div>
        </div>
        <div id="midi-controls">
          <button
            @click=${this.toggleShowMidi}
            class=${this.showMidi ? 'active' : ''}
            >MIDI</button
          >
          <select
            @change=${this.handleMidiInputChange}
            .value=${this.activeMidiInputId || ''}
            style=${this.showMidi ? '' : 'display: none'}>
            ${this.midiInputIds.length > 0
          ? this.midiInputIds.map(
            (id) =>
              html`<option value=${id}>
                      ${this.midiDispatcher.getDeviceName(id)}
                    </option>`,
          )
          : html`<option value="">No devices found</option>`}
          </select>
        </div>
      </div>


      <div id="soundscape" class=${soundscapeClasses}>${this.renderPrompts()}</div>
      <play-pause-button .playbackState=${this.playbackState} @click=${this.playPause}></play-pause-button>`;
  }

  private renderPrompts() {
    return [...this.prompts.values()].map((prompt) => {
      return html`<prompt-controller
        .prompt=${prompt}
        ?filtered=${this.filteredPrompts.has(prompt.text)}
        .midiDispatcher=${this.midiDispatcher}
        .showCC=${this.showMidi}
        .audioLevel=${this.audioLevel}
        @prompt-changed=${this.handlePromptChanged}
        @prompt-removed=${this.handlePromptRemoved}
        >
      </prompt-controller>`;
    });
  }
}
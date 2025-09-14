/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import './LevelSelector';
import type { MidiDispatcher } from '../utils/MidiDispatcher';
import type { Prompt, ControlChange } from '../types';

/** A single prompt input associated with a MIDI CC. */
@customElement('prompt-controller')
export class PromptController extends LitElement {
  static override styles = css`
    :host {
      display: grid;
      place-items: center;
      position: absolute;
      transition: width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      cursor: grab;
      user-select: none;
    }

    :host(.dragging) {
      cursor: grabbing;
      z-index: 10;
    }

    .disc {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 1vmin;
      box-sizing: border-box;
      position: relative;
    }

    .spinner {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(5px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      animation: spin 30s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    level-selector {
      position: absolute;
      width: 140%;
      height: 140%;
      top: -20%;
      left: -20%;
    }

    #text {
      font-weight: 500;
      color: #fff;
      line-height: 1.2;
      z-index: 1;
      transition: font-size 0.3s ease;
      text-shadow: 0 0 5px rgba(0,0,0,0.5);
    }

    .side-controls {
      position: absolute;
      bottom: 0px;
      right: 0px;
      display: flex;
      gap: 1vmin;
      z-index: 1;
      align-items: center;
      padding: 1vmin;
    }

    #midi {
      font-family: monospace;
      font-size: 1.2vmin;
      border: 0.1vmin solid #fff;
      border-radius: 0.5vmin;
      padding: 1px 4px;
      color: #fff;
      background: #0006;
      cursor: pointer;
      visibility: hidden;
      user-select: none;
      .learn-mode & {
        color: orange;
        border-color: orange;
      }
      .show-cc & {
        visibility: visible;
      }
    }

    .remove-btn {
      background: transparent;
      border: none;
      color: #fff;
      font-size: 2vmin;
      cursor: pointer;
      padding: 0;
      margin: 0;
      line-height: 1;
      opacity: 0.5;
      position: absolute;
      top: 1.5vmin;
      right: 1.5vmin;
      z-index: 2;
    }
    .remove-btn:hover {
      opacity: 1;
    }

    :host([filtered]) .spinner {
      background: rgba(90, 13, 0, 0.5);
    }
  `;

  @property({ type: Object }) prompt!: Prompt;
  @property({ type: Boolean, reflect: true }) filtered = false;
  @property({ type: Boolean }) learnMode = false;
  @property({ type: Boolean }) showCC = false;
  @property({ type: Object }) midiDispatcher: MidiDispatcher | null = null;
  @property({ type: Number }) audioLevel = 0;

  @state() private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private promptStartX = 0;
  private promptStartY = 0;


  private get level() {
    return Math.round(this.prompt.weight * 2.5);
  }

  constructor() {
    super();
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  override connectedCallback() {
    super.connectedCallback();

    this.addEventListener('pointerdown', this.handlePointerDown);

    this.midiDispatcher?.addEventListener('cc-message', (e: Event) => {
      const customEvent = e as CustomEvent<ControlChange>;
      const { value, cc } = customEvent.detail;
      if (cc === this.prompt.cc) {
        // MIDI CC 0-127 to level 0-5
        const newLevel = Math.round((value / 127) * 5);
        this.updateLevel(newLevel);
      }
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('pointerdown', this.handlePointerDown);
    // Clean up window listeners if the element is removed while dragging
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
  }

  private handlePointerDown(e: PointerEvent) {
    // Don't drag if clicking on controls
    const path = e.composedPath();
    if (path.some(el => (el as HTMLElement).matches?.('.remove-btn, .dot'))) {
        return;
    }

    e.preventDefault();
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.promptStartX = this.prompt.x || 0;
    this.promptStartY = this.prompt.y || 0;

    document.body.classList.add('dragging-disc');

    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  private handlePointerMove(e: PointerEvent) {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;

    let newX = this.promptStartX + deltaX;
    let newY = this.promptStartY + deltaY;

    // Constrain within parent bounds
    const parent = this.parentElement;
    if (parent) {
      const halfWidth = this.offsetWidth / 2;
      const halfHeight = this.offsetHeight / 2;

      newX = Math.max(halfWidth, Math.min(newX, parent.offsetWidth - halfWidth));
      newY = Math.max(halfHeight, Math.min(newY, parent.offsetHeight - halfHeight));
    }
    this.prompt = { ...this.prompt, x: newX, y: newY };
    this.requestUpdate();
  }

  private handlePointerUp() {
    if (!this.isDragging) return;

    this.isDragging = false;
    document.body.classList.remove('dragging-disc');

    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);

    this.dispatchPromptChange(); // This now sends the updated position
  }

  private dispatchPromptChange() {
    this.dispatchEvent(
      new CustomEvent<Prompt>('prompt-changed', {
        detail: this.prompt,
        bubbles: true,
        composed: true
      }),
    );
  }

  private dispatchPromptRemoved() {
     this.dispatchEvent(
      new CustomEvent<string>('prompt-removed', {
        detail: this.prompt.promptId,
        bubbles: true,
        composed: true
      }),
    );
  }

  private updateLevel(newLevel: number) {
    // Level 0-5 to weight 0-2
    this.prompt.weight = newLevel / 2.5;
    this.dispatchPromptChange();
    this.requestUpdate(); // To re-render the level-selector
  }

  override render() {
    const level = this.level;
    const baseSize = 10;
    const sizeStep = 2.5;
    const discSize = baseSize + level * sizeStep;

    this.style.width = `${discSize}vmin`;
    this.style.height = `${discSize}vmin`;
    this.style.left = `${this.prompt.x || 0}px`;
    this.style.top = `${this.prompt.y || 0}px`;
    this.style.transform = `translate(-50%, -50%)`;


    const baseFontSize = 1.5;
    const fontStep = 0.3;
    const fontSize = baseFontSize + level * fontStep;
    const textStyles = styleMap({
      fontSize: `${fontSize}vmin`,
    });

    // FIX: The `classMap` directive returns a special object for Lit's template processor, not a string.
    // Assigning it to `this.className` causes a type error.
    // The `hostClasses` variable was also not used correctly.
    // This has been corrected to set the class on the host element directly.
    const hostClasses = classMap({
      'dragging': this.isDragging
    });
    this.className = this.isDragging ? 'dragging' : '';

    const discClasses = classMap({
      'disc': true,
      'learn-mode': this.learnMode,
      'show-cc': this.showCC,
    });
    return html`
      <level-selector
          .level=${this.level}
          .color=${this.filtered ? '#888' : this.prompt.color}
          .audioLevel=${this.filtered ? 0 : this.audioLevel}
          @level-changed=${(e: CustomEvent<number>) => this.updateLevel(e.detail)}
      ></level-selector>
      <div class=${discClasses}>
        <div class="spinner"></div>
        <button class="remove-btn" @click=${this.dispatchPromptRemoved}>✕</button>
        <span id="text" style=${textStyles}>${this.prompt.text}</span>
        <div class="side-controls">
           <div id="midi">CC:${this.prompt.cc}</div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prompt-controller': PromptController;
  }
}
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { classMap } from 'lit/directives/class-map.js';

/** Maps prompt level to halo size. */
const MIN_HALO_SCALE = 1;
const MAX_HALO_SCALE = 2.2;

/** The amount of scale to add to the halo based on audio level. */
const HALO_LEVEL_MODIFIER = 1;

/** A 5-step level selector for adjusting prompt weight. */
@customElement('level-selector')
export class LevelSelector extends LitElement {
  static override styles = css`
    :host {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #halo {
      position: absolute;
      z-index: -1;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      mix-blend-mode: lighten;
      will-change: transform;
      transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .dot-wrapper {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    .dot {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 12%;
      aspect-ratio: 1;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      cursor: pointer;
      transition: background 0.2s ease;
      transform: translate(-50%, -50%) translateY(-600%);
    }
    .dot:hover {
       background: rgba(255,255,255,0.4);
    }
    .dot.active {
      background: #fff;
    }
  `;

  @property({ type: Number }) level = 0; // 0-5
  @property({ type: String }) color = '#000';
  @property({ type: Number }) audioLevel = 0;

  private selectLevel(newLevel: number) {
    this.dispatchEvent(new CustomEvent('level-changed', { detail: newLevel }));
  }

  override render() {
    let scale = MIN_HALO_SCALE;
    if (this.level > 0) {
      scale += ((this.level-1) / 4) * (MAX_HALO_SCALE - MIN_HALO_SCALE);
      scale += this.audioLevel * HALO_LEVEL_MODIFIER;
    }

    const haloStyle = styleMap({
      display: this.level > 0 ? 'block' : 'none',
      background: this.color,
      transform: `scale(${scale})`,
    });

    return html`
      <div id="halo" style=${haloStyle}></div>
      ${[1,2,3,4,5].map(i => {
        const angle = -150 + (i-1) * 30;
        const wrapperStyle = styleMap({
          transform: `rotate(${angle}deg)`
        });
        return html`
          <div class="dot-wrapper" style=${wrapperStyle}>
            <div
              class=${classMap({dot: true, active: this.level >= i})}
              @click=${() => this.selectLevel(this.level === i ? 0 : i)}>
            </div>
          </div>
        `
      })}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'level-selector': LevelSelector;
  }
}
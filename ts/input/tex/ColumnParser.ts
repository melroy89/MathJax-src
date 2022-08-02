/*************************************************************
 *
 *  Copyright (c) 2022 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Implements a parser for array column declarations.
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */

import {ArrayItem} from './base/BaseItems.js';
import TexError from './TexError.js';
import {lookup} from '../../util/Options.js';
import ParseUtil from './ParseUtil.js';
import {TEXCLASS} from '../../core/MmlTree/MmlNode.js';

/***********************************************************************/

/**
 * The state of the columns analyzed so far.
 */
export type ColumnState = {
  template: string;                     // the template string for the columns
  i: number;                            // the current location in the template
  c: string;                            // the current column identifier
  j: number;                            // the current column number
  calign: string[],                     // the column alignments
  cwidth: string[];                     // the explicit column widths
  clines: string[],                     // the column lines
  cstart: string[],                     // the '>' declarations (not currently used)
  cend:   string[],                     // the '<' declarations (not currently used)
  ralign: [number, string, string][]    // the row alignment and column width/align when specified
}

/**
 * A function to handle a column declaration
 */
export type ColumnHandler = (state: ColumnState) => void;


/***********************************************************************/

/**
 * The ColumnParser class for processing array environment column templates.
 */
export class ColumnParser {

  /**
   * The handlers for each column character type (future: can be augmented by \newcolumntype)
   */
  public columnHandler: {[c: string]: ColumnHandler} = {
    l: (state) => state.calign[state.j++] = 'left',
    c: (state) => state.calign[state.j++] = 'center',
    r: (state) => state.calign[state.j++] = 'right',
    p: (state) => this.getColumn(state, TEXCLASS.VTOP),
    m: (state) => this.getColumn(state, TEXCLASS.VCENTER),
    b: (state) => this.getColumn(state, TEXCLASS.VBOX),
    w: (state) => this.getColumn(state, TEXCLASS.VTOP, ''),
    W: (state) => this.getColumn(state, TEXCLASS.VTOP, ''),
    '|': (state) => state.clines[state.j] = 'solid',
    ':': (state) => state.clines[state.j] = 'dashed',
    //
    //  Currently unused
    //
    '>': (state) => state.cstart[state.j] = this.getBraces(state),
    '<': (state) => state.cend[state.j - 1] = this.getBraces(state),
    //
    // Ignored
    //
    '@': (state) => this.getBraces(state),
    '!': (state) => this.getBraces(state),
    ' ': (_state) => {},
  };

  /**
   * Process an array column template
   *
   * @param {string} template   The alignment template
   * @param {ArrayItem} array   The ArrayItem for the template
   */
  public process(template: string, array: ArrayItem) {
    //
    // Initialize the state
    //
    const state: ColumnState = {
      template: template, i: 0, j: 0, c: '',
      cwidth: [], calign: [], clines: [],
      cstart: [], cend: [],
      ralign: array.ralign
    };
    //
    // Loop through the template to process the column specifiers
    //
    while (state.i < state.template.length) {
      const c = state.c = String.fromCodePoint(state.template.codePointAt(state.i));
      state.i += c.length;
      if (!this.columnHandler.hasOwnProperty(c)) {
        throw new TexError('BadColumnCharacter', 'Unknown column specifier: %1', c);
      }
      this.columnHandler[c](state);
    }
    //
    // Set the column alignments
    //
    const calign = state.calign;
    array.arraydef.columnalign = calign.join(' ');
    //
    // Set the column widths, if needed
    //
    if (state.cwidth.length) {
      const cwidth = [...state.cwidth];
      if (cwidth.length < calign.length) {
        cwidth.push('auto');
      }
      array.arraydef.columnwidth = cwidth.map(w => w || 'auto').join(' ');
    }
    //
    // Set the column lines and table frame
    //
    if (state.clines.length) {
      const clines = [...state.clines];
      if (clines[0]) {
        // @test Enclosed left right, Enclosed left
        array.frame.push('left');
        array.dashed = (clines[0] === 'dashed');
      }
      if (clines.length > calign.length) {
        // @test Enclosed left right, Enclosed right
        array.frame.push('right');
        clines.pop();
      } else if (clines.length < calign.length) {
        clines.push('none');
      }
      // @test Enclosed left right
      array.arraydef.columnlines = clines.slice(1).map(l => l || 'none').join(' ');
    }
  }

  /**
   * Read a p/m/b/w/W column declaration
   *
   * @param {ColumnState} state   The current state of the parser
   * @param {number} ralign       The TEXCLASS for vertical alignment
   * @param {string=} calign      The column alignment ('' means get it as an argument)
   */
  public getColumn(state: ColumnState, ralign: number, calign: string = 'left') {
    state.calign[state.j] = calign || this.getAlign(state);
    state.cwidth[state.j] = this.getDimen(state);
    state.ralign[state.j] = [ralign, state.cwidth[state.j], state.calign[state.j]];
    state.j++;
  }

  /**
   * Get a dimension argument
   *
   * @param {ColumnState} state   The current state of the parser
   */
  public getDimen(state: ColumnState) {
    const dim = this.getBraces(state);
    if (!ParseUtil.matchDimen(dim)[0]) {
      throw new TexError('MissingColumnDimOrUnits',
                         'Missing dimension or its units for %1 column declaration', state.c);
    }
    return dim;
  }

  /**
   * Get an alignment argument
   *
   * @param {ColumnState} state   The current state of the parser
   */
  public getAlign(state: ColumnState) {
    const align = this.getBraces(state);
    return lookup(align.toLowerCase(), {l: 'left', c: 'center', r: 'right'}, '');
  }

  /**
   * Get a braced argument
   *
   * @param {ColumnState} state   The current state of the parser
   */
  public getBraces(state: ColumnState) {
    while (state.template[state.i] === ' ') state.i++;
    if (state.i > state.template.length) {
      throw new TexError('MissingArgForColumn', 'Missing argument for %1 column declaration', state.c);
    }
    if (state.template[state.i] !== '{') {
      return state.template[state.i++];
    }
    let i = ++state.i, braces = 1;
    while (state.i < state.template.length) {
      switch (state.template.charAt(state.i++)) {
      case '\\':  state.i++; break;
      case '{':   braces++; break;
      case '}':
        if (--braces === 0) {
          return state.template.slice(i, state.i - 1);
        }
        break;
      }
    }
    throw new TexError('MissingCloseBrace', 'Missing close brace');
  }

}
define(function (require, exports, module) {
	'use strict';

	var LanguageManager = brackets.getModule("language/LanguageManager");

	CodeMirror.defineMode("therion", function (config, parserConfig) {
		var indentUnit = config.indentUnit,
			keywords = parserConfig.keywords || {},
			builtins = parserConfig.builtins || {},
			blockKeywords = parserConfig.blockKeywords || {},
			atoms = parserConfig.atoms || {},
			hooks = parserConfig.hooks || {},
			multiLineStrings = parserConfig.multiLineStrings;
		var isOperatorChar = /[+\-*&%=<>!?|\/]/;

		var curPunc;

		function tokenBase(stream, state) {
			var ch = stream.next();
			if (hooks[ch]) {
				var result = hooks[ch](stream, state);
				if (result !== false) return result;
			}
			if (ch == '"' || ch == "'") {
				state.tokenize = tokenString(ch);
				return state.tokenize(stream, state);
			}
			if (/[\[\]{}\(\),;\:\.]/.test(ch)) {
				curPunc = ch;
				return "bracket";
			}
			if (/\d/.test(ch)) {
				stream.eatWhile(/[\w\.]/);
				return "number";
			}
			/**
			if (ch == "/") {
				if (stream.eat("*")) {
					state.tokenize = tokenComment;
					return tokenComment(stream, state);
				}
				if (stream.eat("/")) {
					stream.skipToEnd();
					return "comment";
				}
			}
			*/
			if (isOperatorChar.test(ch)) {
				stream.eatWhile(isOperatorChar);
				return "operator";
			}
			stream.eatWhile(/[\w\$_]/);
			var cur = stream.current();
			if (keywords.propertyIsEnumerable(cur)) {
				if (blockKeywords.propertyIsEnumerable(cur)) curPunc = "newstatement";
				return "keyword";
			}
			if (builtins.propertyIsEnumerable(cur)) {
				return "builtin";
			}
			if (atoms.propertyIsEnumerable(cur)) return "atom";
			return "word";
		}

		function tokenString(quote) {
			return function (stream, state) {
				var escaped = false,
					next, end = false;
				while ((next = stream.next()) != null) {
					if (next == quote && !escaped) {
						end = true;
						break;
					}
					escaped = !escaped && next == "\\";
				}
				if (end || !(escaped || multiLineStrings))
					state.tokenize = tokenBase;
				return "string";
			};
		}

		/**
		function tokenComment(stream, state) {
			var maybeEnd = false,
				ch;
			while (ch = stream.next()) {
				if (ch == "/" && maybeEnd) {
					state.tokenize = tokenBase;
					break;
				}
				maybeEnd = (ch == "*");
			}
			return "comment";
		}
		*/

		function Context(indented, column, type, align, prev) {
			this.indented = indented;
			this.column = column;
			this.type = type;
			this.align = align;
			this.prev = prev;
		}

		function pushContext(state, col, type) {
			return state.context = new Context(state.indented, col, type, null, state.context);
		}

		function popContext(state) {
			var t = state.context.type;
			if (t == ")" || t == "]" || t == "}")
				state.indented = state.context.indented;
			return state.context = state.context.prev;
		}

		// Interface

		return {
			startState: function (basecolumn) {
				return {
					tokenize: null,
					context: new Context((basecolumn || 0) - indentUnit, 0, "top", false),
					indented: 0,
					startOfLine: true
				};
			},

			token: function (stream, state) {
				var ctx = state.context;
				if (stream.sol()) {
					if (ctx.align == null) ctx.align = false;
					state.indented = stream.indentation();
					state.startOfLine = true;
				}
				if (stream.eatSpace()) return null;
				curPunc = null;
				var style = (state.tokenize || tokenBase)(stream, state);
				if (style == "comment" || style == "meta") return style;
				if (ctx.align == null) ctx.align = true;

				if ((curPunc == ";" || curPunc == ":") && ctx.type == "statement") popContext(state);
				else if (curPunc == "{") pushContext(state, stream.column(), "}");
				else if (curPunc == "[") pushContext(state, stream.column(), "]");
				else if (curPunc == "(") pushContext(state, stream.column(), ")");
				else if (curPunc == "}") {
					while (ctx.type == "statement") ctx = popContext(state);
					if (ctx.type == "}") ctx = popContext(state);
					while (ctx.type == "statement") ctx = popContext(state);
				} else if (curPunc == ctx.type) popContext(state);
				else if (ctx.type == "}" || ctx.type == "top" || (ctx.type == "statement" && curPunc == "newstatement"))
					pushContext(state, stream.column(), "statement");
				state.startOfLine = false;
				return style;
			},

			indent: function (state, textAfter) {
				if (state.tokenize != tokenBase && state.tokenize != null) return 0;
				var firstChar = textAfter && textAfter.charAt(0),
					ctx = state.context,
					closing = firstChar == ctx.type;
				if (ctx.type == "statement") return ctx.indented + (firstChar == "{" ? 0 : indentUnit);
				else if (ctx.align) return ctx.column + (closing ? 0 : 1);
				else return ctx.indented + (closing ? 0 : indentUnit);
			},

			electricChars: "{}"
		};
	});

	function words(str) {
		var obj = {},
			words = str.split(" ");
		for (var i = 0; i < words.length; ++i) obj[words[i]] = true;
		return obj;
	}

	function cppHook(stream, state) {
		if (!state.startOfLine) return false;
		stream.skipToEnd();
		return "meta";
	}

	var _keywords = "encoding survey endsurvey centerline centreline endcenterline endcentreline " +
		"date team explo-date explo explo-team instruments position notes pictures pics insts assistant " +
		"dog infer plumbs equates declination grid-angle sd " +
		"grade units clino tape length compass bearing gradient tape x y z dx dy dz calibrate mark "+
		"cs fix data from to length lenght backclino backcompass backbearing backgradient fromcount tocount " +
		"counter depth fromdepth depthchange northing easting ceiling floor ignore ignoreall extend input "+
		"equate join count map endmap break preview group engroup walls vthreshold inclination "+
		"layout endlayout source copy scale grid-size grid doc-author doc-title author title copyright " +
		"base-scale scale-bar rotate origin origin-label color map-fg map-bg transparency opacity language " +
		"map-comment statistics length topo copyright legend map-header map-header-bg layers symbol-hide " +
		"point line symbol-color set width debug station names size overlap exclude pages page setup code " +
		"legend-width def enddef beginpattern endpattern endcode export model database header symbol-assign " +
		"projection scale stations sketch flip station-name section dimensions select bitmap grid-unit grid-flip " +
		"surface endsurface revise exclude-pages page-setup if else fielseif for forever endfor vardef " +
		"\def \vbox \hbox \fi \ifx \else " +
		"thdraw thclean thfill pickup draw withcolor drawarrow thdir thwarning thdrawoptions picture image " +
		"numeric step until initsymbol scrap projection copyrigth label text water-flow scale orientation " +
		"air-draught breakdown-choke continuation entrance arrow endline contour smooth rock border close " +
		"&lt;it&gt; &lt;center&gt; &lt;bf&gt; &lt;br&gt; " +
		"wall station name endscrap area endarea " +
		"pebbles altitude tree crystal border height traverse rope u: edge outline gypsum gypsum-flower " +
		"dig water id arrow clay sand reverse blocks ice snow spring root vegetable-debris flow rock-border " +
		"pit overhang sink doline arch remark height passage-height station-name bedrock raft debris guano " +
		"flowstone moonmilk stalactite stalacmite pillar curtain helicitite soda-straw wall-calcite popcorn " +
		"disk gypsum-flower aragonite cave-pearl rimstone-pool rimstone-dam anastomosis karren scallop flute " +
		"raft-cone anchor fixed-lader rope-lader steps bridge traverse camp no-equipment narrow-end low-end " +
		"flowstone-choke archeo-material paleo-material root spring ice-stalactite ice-stalacmite stalactite " +
		"stalacmite ice-pillar pillar "+
		"gradient map-connection extra rock-edge slope cave sump";

	var _builtins = "left right up down " +
		"-in -out -proj -projection -fmt -format -layout -o -output -copyright -title -entrance -author -scale -text " +
		"-orientation -close -name -subtype -id -value -orientation -orient -align -place -clip -dist -from " +
		"-visibility -context -extend -scrap -explored -outline -reverse -size -r-size -l-size -smooth -adjust " +
		"-place default -clip -context -altitude -border -direction begin both -gradient center -head -count -survey " +
		"-filter -surveys -attr station-names create use " +
		"xs s m l xl n s e w ne nw se sw " +
		"on off auto above below all fr en es "+
		"meters meter m centimeters centimeter cm inch inches in feet feets ft yard yards yd degrees degree deg " +
		"minute minutes min grads grad mils mil percent percentage " +
		"fixed painted temporary natural winter summer undifined permanent intermittent paleo " +
		"underlying overlying unsurveyed presumed conjectural intermittent " +
		"surface duplicate splay approx approximate not -attr code explored reverse vertical horizontal start " +
		"ignore hide bottom metapost tex-map tex-atlas explo-length topo-length "+
		"normal topofil diving cartesian cylpolar dimensions nosurvey " +
		"l-size none plan elevation extended map model pdf xvi svg sql kml vrml html lox 3dmf " +
		"PenA PenB PenC PenD PenE identity arclength begingroup endgroup adjust_step exitif picture pencircle " +
		"scaled aligned rotated fullcircle dir withpen rotatedaround path shifted arctime of ";

	/**
	CodeMirror.defineMIME("text/x-glsl", {
		name: "glsl",
		keywords: words(_keywords),
		builtins: words(_builtins),
		blockKeywords: words("case do else for if switch while struct"),
		atoms: words("null"),
		hooks: {
			"#": cppHook
		}
	});
	*/

	LanguageManager.defineLanguage("therion", {
		name: "Therion",
		mode: ["therion"],
		fileExtensions: ["th","th2","thconfig","thc"],
		lineComment: ["#"]
	});
});

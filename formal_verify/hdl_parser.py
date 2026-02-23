"""
HDL Parser — Verilog and VHDL tokenizers, AST node types, and parsers.

Consumed by formal_verify.py (analysis engine) and diagrams.py (diagram builders).
"""

import re
from dataclasses import dataclass, field


# ══════════════════════════════════════════════════════════════
# AST Nodes
# ══════════════════════════════════════════════════════════════

@dataclass
class Register:
    name: str
    width: int = 1
    is_array: bool = False
    array_size: int = 0

@dataclass
class Wire:
    name: str
    width: int = 1
    driver: str = ''  # the assign expression driving this wire

@dataclass
class ContinuousAssign:
    target: str       # base signal name
    target_full: str  # full LHS including index
    value: str        # RHS expression

@dataclass
class Port:
    name: str
    direction: str  # 'input' or 'output'
    width: int = 1

@dataclass
class StateEncoding:
    name: str
    value: str
    width: int = 0

@dataclass
class AssignNode:
    target: str       # base register name
    target_full: str  # full LHS including index
    value: str        # RHS as string

@dataclass
class IfNode:
    condition: str
    then_body: list   # list of AST nodes
    else_body: list   # list of AST nodes (empty if no else)

@dataclass
class CaseNode:
    expr: str
    items: list       # list of (label_str, [AST nodes])
    has_default: bool = False

@dataclass
class ParseResult:
    registers: dict
    states: dict
    inputs: set
    tree: list
    wires: dict = field(default_factory=dict)
    continuous_assigns: list = field(default_factory=list)
    always_blocks: list = field(default_factory=list)
    is_combinatorial: bool = False
    ports: dict = field(default_factory=dict)  # name -> Port


# ══════════════════════════════════════════════════════════════
# Token & TokenStream
# ══════════════════════════════════════════════════════════════

class Token:
    __slots__ = ('type', 'value')
    def __init__(self, type_, value):
        self.type = type_
        self.value = value
    def __repr__(self):
        return f'{self.type}:{self.value!r}'

EOF_TOKEN = Token('EOF', '')


class TokenStream:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def peek(self):
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return EOF_TOKEN

    def advance(self):
        tok = self.peek()
        self.pos += 1
        return tok

    def at(self, value):
        return self.peek().value == value

    def at_any(self, *values):
        return self.peek().value in values

    def at_type(self, type_):
        return self.peek().type == type_

    def consume(self, value):
        tok = self.peek()
        if tok.value != value:
            raise SyntaxError(
                f"Expected '{value}', got '{tok.value}' at token #{self.pos} "
                f"(context: {self._context()})"
            )
        return self.advance()

    def skip_if(self, value):
        if self.at(value):
            self.advance()
            return True
        return False

    def collect_until(self, *stop_values):
        """Collect token values as string until stop value at depth 0."""
        parts = []
        depth_p = 0  # parentheses
        depth_b = 0  # brackets
        while self.pos < len(self.tokens):
            tok = self.peek()
            if tok.value in ('(', ):
                depth_p += 1
            elif tok.value == ')':
                if depth_p == 0 and ')' in stop_values:
                    break
                depth_p -= 1
            elif tok.value == '[':
                depth_b += 1
            elif tok.value == ']':
                if depth_b == 0 and ']' in stop_values:
                    break
                depth_b -= 1
            elif depth_p == 0 and depth_b == 0 and tok.value in stop_values:
                break
            parts.append(self.advance().value)
        return ' '.join(parts)

    def _context(self):
        start = max(0, self.pos - 3)
        end = min(len(self.tokens), self.pos + 3)
        return ' '.join(t.value for t in self.tokens[start:end])


# ══════════════════════════════════════════════════════════════
# Verilog Tokenizer
# ══════════════════════════════════════════════════════════════

def tokenize_verilog(code):
    code = re.sub(r'//.*', '', code)
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)

    token_spec = [
        ('NUMBER',    r"\d+'[bBhHdDoO][0-9a-fA-F_xXzZ]+"),
        ('DECIMAL',   r'\d+'),
        ('IDENT',     r'[a-zA-Z_]\w*'),
        ('NB_ASSIGN', r'<='),
        ('EQ',        r'=='),
        ('NEQ',       r'!='),
        ('GEQ',       r'>='),
        ('PLUSCOLON',  r'\+:'),
        ('LSHIFT',    r'<<'),
        ('RSHIFT',    r'>>'),
        ('LAND',      r'&&'),
        ('LOR',       r'\|\|'),
        ('SEMI',      r';'),
        ('COMMA',     r','),
        ('LPAREN',    r'\('),
        ('RPAREN',    r'\)'),
        ('LBRACK',    r'\['),
        ('RBRACK',    r'\]'),
        ('LBRACE',    r'\{'),
        ('RBRACE',    r'\}'),
        ('COLON',     r':'),
        ('AT',        r'@'),
        ('HASH',      r'#'),
        ('BANG',      r'!'),
        ('QUEST',     r'\?'),
        ('PLUS',      r'\+'),
        ('MINUS',     r'-'),
        ('STAR',      r'\*'),
        ('TILDE',     r'~'),
        ('CARET',     r'\^'),
        ('BITOR',     r'\|'),
        ('BITAND',    r'&'),
        ('GT',        r'>'),
        ('LT',        r'<'),
        ('DOT',       r'\.'),
        ('SKIP',      r'[ \t\n\r]+'),
    ]

    tok_regex = '|'.join(f'(?P<{name}>{pat})' for name, pat in token_spec)
    tokens = []
    for mo in re.finditer(tok_regex, code):
        kind = mo.lastgroup
        if kind == 'SKIP':
            continue
        tokens.append(Token(kind, mo.group()))
    return tokens


# ══════════════════════════════════════════════════════════════
# Verilog Parser
# ══════════════════════════════════════════════════════════════

class VerilogParser:
    def __init__(self, code):
        self.raw_code = code
        self.code = re.sub(r'//.*', '', code)
        self.code = re.sub(r'/\*.*?\*/', '', self.code, flags=re.DOTALL)
        self.registers = {}
        self.states = {}
        self.inputs = set()
        self.wires = {}
        self.continuous_assigns = []
        self.ports = {}

    def parse(self):
        self._parse_declarations()
        always_blocks = self._parse_all_always()
        # Merge all blocks into flat tree for backward compat
        tree = []
        for block in always_blocks:
            tree.extend(block)
        is_comb = len(always_blocks) == 0 and len(self.continuous_assigns) > 0
        return ParseResult(
            registers=self.registers,
            states=self.states,
            inputs=self.inputs,
            tree=tree,
            wires=self.wires,
            continuous_assigns=self.continuous_assigns,
            always_blocks=always_blocks,
            is_combinatorial=is_comb,
            ports=self.ports,
        )

    # ── Declaration parsing (regex) ──

    def _parse_declarations(self):
        # Input ports with optional width
        for m in re.finditer(
            r'input\s+(?:wire\s+)?(?:\[(\d+)\s*:\s*(\d+)\]\s*)?(\w+)', self.code
        ):
            hi, lo, name = m.groups()
            width = (int(hi) - int(lo) + 1) if hi else 1
            self.inputs.add(name)
            self.ports[name] = Port(name, 'input', width)

        # Output ports with optional width
        for m in re.finditer(
            r'output\s+(?:wire\s+|reg\s+)?(?:\[(\d+)\s*:\s*(\d+)\]\s*)?(\w+)', self.code
        ):
            hi, lo, name = m.groups()
            width = (int(hi) - int(lo) + 1) if hi else 1
            self.ports[name] = Port(name, 'output', width)

        # reg [H:L] name [AH:AL];  (array)
        for m in re.finditer(
            r'reg\s+\[(\d+)\s*:\s*(\d+)\]\s*(\w+)\s*\[(\d+)\s*:\s*(\d+)\]\s*;',
            self.code
        ):
            hi, lo, name, ahi, alo = m.groups()
            self.registers[name] = Register(
                name, int(hi)-int(lo)+1,
                is_array=True, array_size=int(ahi)-int(alo)+1
            )

        # reg [H:L] name;  (vector)
        for m in re.finditer(
            r'reg\s+\[(\d+)\s*:\s*(\d+)\]\s*(\w+)\s*;', self.code
        ):
            hi, lo, name = m.groups()
            if name not in self.registers:
                self.registers[name] = Register(name, int(hi)-int(lo)+1)

        # reg name;  (single bit)
        for m in re.finditer(r'reg\s+(\w+)\s*;', self.code):
            name = m.group(1)
            if name not in self.registers:
                self.registers[name] = Register(name, 1)

        # reg name, name2;  (comma-separated single bit)
        for m in re.finditer(r'reg\s+(\w+)\s*,\s*(\w+)\s*;', self.code):
            for g in m.groups():
                if g not in self.registers:
                    self.registers[g] = Register(g, 1)

        # wire [H:L] name = expr;  (with inline assignment)
        for m in re.finditer(
            r'wire\s+\[(\d+)\s*:\s*(\d+)\]\s*(\w+)\s*=\s*(.*?);', self.code
        ):
            hi, lo, name, expr = m.groups()
            w = int(hi) - int(lo) + 1
            self.wires[name] = Wire(name, w, expr.strip())

        # wire [H:L] name;  (vector, no assignment)
        for m in re.finditer(
            r'wire\s+\[(\d+)\s*:\s*(\d+)\]\s*(\w+)\s*;', self.code
        ):
            hi, lo, name = m.groups()
            if name not in self.wires:
                self.wires[name] = Wire(name, int(hi) - int(lo) + 1)

        # wire name;  (single bit)
        for m in re.finditer(r'wire\s+(\w+)\s*;', self.code):
            name = m.group(1)
            if name not in self.wires:
                self.wires[name] = Wire(name, 1)

        # assign target = expr;  (continuous assignments)
        for m in re.finditer(r'assign\s+([\w\[\]:\s]+?)\s*=\s*(.*?);', self.code):
            target_full = m.group(1).strip()
            base_name = re.match(r'(\w+)', target_full).group(1)
            value = m.group(2).strip()
            self.continuous_assigns.append(
                ContinuousAssign(base_name, target_full, value)
            )
            if base_name in self.wires:
                self.wires[base_name].driver = value

        # parameter NAME = VALUE, ...;
        for m in re.finditer(r'parameter\s+(.*?);', self.code, re.DOTALL):
            text = m.group(1)
            # skip module-level parameters like #(parameter ...)
            if 'ADDR' in text and '6\'d' in text:
                continue
            for pm in re.finditer(r'(\w+)\s*=\s*(\d+\'[bBhH][0-9a-fA-F_]+)', text):
                name, val = pm.groups()
                width_m = re.match(r'(\d+)\'', val)
                width = int(width_m.group(1)) if width_m else 0
                self.states[name] = StateEncoding(name, val, width)

    # ── Always block parsing ──

    def _parse_all_always(self):
        """Parse all always blocks in the code, returning list of trees."""
        tokens = tokenize_verilog(self.code)
        ts = TokenStream(tokens)
        blocks = []

        while True:
            # Find next 'always'
            while not ts.at('always') and not ts.at_type('EOF'):
                ts.advance()
            if ts.at_type('EOF'):
                break

            ts.consume('always')
            ts.consume('@')
            ts.consume('(')
            ts.collect_until(')')
            ts.consume(')')

            self._ts = ts
            tree = self._parse_statement()
            blocks.append(tree)

        return blocks

    def _parse_statement(self):
        ts = self._ts
        if ts.at('begin'):
            return self._parse_block()
        elif ts.at('if'):
            return [self._parse_if()]
        elif ts.at('case') or ts.at('casex') or ts.at('casez'):
            return [self._parse_case()]
        elif ts.at_type('IDENT') or ts.at_type('EOF'):
            if ts.at_type('EOF'):
                return []
            return [self._parse_assignment()]
        else:
            ts.advance()  # skip unexpected token
            return []

    def _parse_block(self):
        ts = self._ts
        ts.consume('begin')
        stmts = []
        while not ts.at('end') and not ts.at_type('EOF'):
            stmts.extend(self._parse_statement())
        ts.consume('end')
        return stmts

    def _parse_if(self):
        ts = self._ts
        ts.consume('if')
        ts.consume('(')
        condition = ts.collect_until(')')
        ts.consume(')')
        then_body = self._parse_statement()

        else_body = []
        if ts.skip_if('else'):
            else_body = self._parse_statement()

        return IfNode(condition, then_body, else_body)

    def _parse_case(self):
        ts = self._ts
        ts.advance()  # consume case/casex/casez
        ts.consume('(')
        expr = ts.collect_until(')')
        ts.consume(')')

        items = []
        has_default = False

        while not ts.at('endcase') and not ts.at_type('EOF'):
            if ts.at('default'):
                ts.advance()
                ts.consume(':')
                body = self._parse_statement()
                items.append(('default', body))
                has_default = True
            else:
                label = ts.collect_until(':')
                ts.consume(':')
                body = self._parse_statement()
                items.append((label.strip(), body))

        ts.consume('endcase')
        return CaseNode(expr, items, has_default)

    def _parse_assignment(self):
        ts = self._ts
        # Collect LHS: identifier possibly with array indexing
        name = ts.advance().value
        base_name = name
        full_target = name

        while ts.at('['):
            ts.consume('[')
            idx = ts.collect_until(']')
            ts.consume(']')
            full_target += f'[{idx}]'

        ts.consume('<=')
        value = ts.collect_until(';')
        ts.consume(';')

        return AssignNode(base_name, full_target, value)


# ══════════════════════════════════════════════════════════════
# VHDL Tokenizer
# ══════════════════════════════════════════════════════════════

def tokenize_vhdl(code):
    code = re.sub(r'--.*', '', code)

    token_spec = [
        ('STRING',   r'"[^"]*"'),
        ('CHAR',     r"'[^']'"),
        ('DECIMAL',  r'\d+'),
        ('IDENT',    r'[a-zA-Z_]\w*'),
        ('ASSIGN',   r'<='),
        ('INIT',     r':='),
        ('ARROW',    r'=>'),
        ('NEQ',      r'/='),
        ('GEQ',      r'>='),
        ('SEMI',     r';'),
        ('COMMA',    r','),
        ('LPAREN',   r'\('),
        ('RPAREN',   r'\)'),
        ('COLON',    r':'),
        ('PLUS',     r'\+'),
        ('MINUS',    r'-'),
        ('STAR',     r'\*'),
        ('AMP',      r'&'),
        ('EQ',       r'='),
        ('GT',       r'>'),
        ('LT',       r'<'),
        ('DOT',      r'\.'),
        ('BITOR',    r'\|'),
        ('SKIP',     r'[ \t\n\r]+'),
    ]

    tok_regex = '|'.join(f'(?P<{name}>{pat})' for name, pat in token_spec)
    tokens = []
    for mo in re.finditer(tok_regex, code):
        kind = mo.lastgroup
        if kind == 'SKIP':
            continue
        tokens.append(Token(kind, mo.group()))
    return tokens


# ══════════════════════════════════════════════════════════════
# VHDL Parser
# ══════════════════════════════════════════════════════════════

class VHDLParser:
    def __init__(self, code):
        self.raw_code = code
        self.code = re.sub(r'--.*', '', code)
        self.registers = {}
        self.states = {}
        self.inputs = set()
        self.ports = {}

    def parse(self):
        self._parse_declarations()
        tree = self._parse_process()
        return ParseResult(
            registers=self.registers,
            states=self.states,
            inputs=self.inputs,
            tree=tree,
            ports=self.ports,
        )

    def _parse_declarations(self):
        # All ports: name : in/out TYPE[(H downto L)]
        # Don't require a trailing ; or ) — the last port may end at a newline.
        for m in re.finditer(
            r'(\w+)\s*:\s*(in|out)\s+(\w+(?:\s*\(\s*\d+\s+downto\s+\d+\s*\))?)',
            self.code, re.IGNORECASE
        ):
            name = m.group(1).lower()
            direction = m.group(2).lower()
            type_str = m.group(3).strip()
            width = 1
            wm = re.search(r'\(\s*(\d+)\s+downto\s+(\d+)\s*\)', type_str)
            if wm:
                width = int(wm.group(1)) - int(wm.group(2)) + 1
            if direction == 'in':
                self.inputs.add(name)
            self.ports[name] = Port(name, 'input' if direction == 'in' else 'output', width)

        # signal name : TYPE := init;
        for m in re.finditer(
            r'signal\s+(\w+)\s*:\s*(.*?)(?:\s*:=\s*(.*?))?\s*;',
            self.code, re.IGNORECASE
        ):
            name = m.group(1)
            type_str = m.group(2).strip()

            width = 1
            wm = re.search(r'\(\s*(\d+)\s+downto\s+(\d+)\s*\)', type_str)
            if wm:
                width = int(wm.group(1)) - int(wm.group(2)) + 1

            self.registers[name.lower()] = Register(name.lower(), width)

    def _parse_process(self):
        tokens = tokenize_vhdl(self.code)
        ts = TokenStream(tokens)

        # Find 'process'
        while not ts.at('process') and not ts.at_type('EOF'):
            ts.advance()
        if ts.at_type('EOF'):
            return []

        ts.consume('process')
        # Skip sensitivity list
        if ts.at('('):
            ts.consume('(')
            ts.collect_until(')')
            ts.consume(')')

        # Find 'begin'
        while not ts.at('begin') and not ts.at_type('EOF'):
            ts.advance()
        ts.consume('begin')

        self._ts = ts

        # Skip 'if rising_edge(clk) then' wrapper
        body = self._parse_body_until('end')
        # consume 'end process ;'
        ts.consume('end')
        if ts.at('process'):
            ts.advance()
        ts.skip_if(';')

        # Unwrap the rising_edge if wrapper
        if len(body) == 1 and isinstance(body[0], IfNode):
            inner = body[0]
            if 'rising_edge' in inner.condition:
                return inner.then_body

        return body

    def _parse_body_until(self, *stop_kw):
        ts = self._ts
        stmts = []
        while not ts.at_any(*stop_kw) and not ts.at_type('EOF'):
            node = self._parse_vhdl_statement()
            if node is not None:
                stmts.append(node)
        return stmts

    def _parse_vhdl_statement(self):
        ts = self._ts
        if ts.at('if'):
            return self._parse_vhdl_if()
        elif ts.at('case'):
            return self._parse_vhdl_case()
        elif ts.at_type('IDENT'):
            return self._parse_vhdl_assignment()
        else:
            ts.advance()
            return None

    def _parse_vhdl_if(self):
        ts = self._ts
        ts.consume('if')
        condition = ts.collect_until('then')
        ts.consume('then')

        then_body = self._parse_body_until('elsif', 'else', 'end')

        else_body = []
        # Handle elsif chain by nesting
        if ts.at('elsif'):
            ts.advance()  # consume 'elsif'
            cond2 = ts.collect_until('then')
            ts.consume('then')
            inner_then = self._parse_body_until('elsif', 'else', 'end')
            inner_else = []
            # Continue nesting for more elsif/else
            while ts.at('elsif'):
                ts.advance()
                c = ts.collect_until('then')
                ts.consume('then')
                b = self._parse_body_until('elsif', 'else', 'end')
                inner_else = [IfNode(c, b, [])]
            if ts.at('else'):
                ts.consume('else')
                (inner_else if not inner_else else inner_else[0].else_body).extend(
                    self._parse_body_until('end')
                )
                if not inner_else:
                    inner_else = self._parse_body_until('end')
            else_body = [IfNode(cond2, inner_then, inner_else)]

        elif ts.at('else'):
            ts.consume('else')
            else_body = self._parse_body_until('end')

        ts.consume('end')
        ts.consume('if')
        ts.consume(';')

        return IfNode(condition, then_body, else_body)

    def _parse_vhdl_case(self):
        ts = self._ts
        ts.consume('case')
        expr = ts.collect_until('is')
        ts.consume('is')

        items = []
        has_default = False

        while not ts.at('end') and not ts.at_type('EOF'):
            ts.consume('when')
            if ts.at('others'):
                ts.advance()
                ts.consume('=>')
                body = self._parse_body_until('when', 'end')
                items.append(('others', body))
                has_default = True
            else:
                label = ts.collect_until('=>')
                ts.consume('=>')
                body = self._parse_body_until('when', 'end')
                items.append((label.strip(), body))

        ts.consume('end')
        ts.consume('case')
        ts.consume(';')

        return CaseNode(expr, items, has_default)

    def _parse_vhdl_assignment(self):
        ts = self._ts
        name = ts.advance().value.lower()
        full_target = name

        if ts.at('('):
            ts.consume('(')
            idx = ts.collect_until(')')
            ts.consume(')')
            full_target += f'({idx})'

        ts.consume('<=')
        value = ts.collect_until(';')
        ts.consume(';')

        return AssignNode(name, full_target, value)

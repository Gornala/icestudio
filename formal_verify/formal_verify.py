#!/usr/bin/env python3
"""
Formal Verification Tool for Verilog and VHDL

Checks if all registers are well-defined in all states at all times.

Assumptions:
- All analyzed code is synchronous (clocked)
- Reset occurs at t=0 (first branch of always/process block)
- t >= 0
"""

import sys
from pathlib import Path

from hdl_parser import (
    AssignNode, IfNode, CaseNode,
    VerilogParser, VHDLParser,
)
from diagrams import (
    _build_mermaid,
    _build_dataflow_diagram,
    _build_state_diagram,
)


# ══════════════════════════════════════════════════════════════
# Analysis Engine
# ══════════════════════════════════════════════════════════════

class FormalAnalyzer:
    """
    Analyzes a parsed HDL design for register definedness.

    Algorithm:
    1. The first branch of the top-level if/else is the RESET branch.
       Check that ALL registers are assigned there.
    2. Enumerate all paths through the remaining branches.
       For each path, report which registers are NOT explicitly assigned
       (they retain previous value — valid only if reset assigned them).
    3. Check case statements for missing state coverage.
    """

    def __init__(self, registers, states, inputs, tree):
        self.registers = registers
        self.states = states
        self.inputs = inputs
        self.tree = tree
        self.issues = []
        self.paths = []

    def analyze(self):
        self.issues = []
        self.paths = []
        self.reset_assigns = set()

        if not self.tree:
            self.issues.append(('CRITICAL', 'No always/process block found'))
            return self.issues, self.paths, self.reset_assigns

        # Find the top-level if (should be the reset condition)
        top_if = None
        for node in self.tree:
            if isinstance(node, IfNode):
                top_if = node
                break

        if top_if is None:
            self.issues.append(('WARNING', 'No reset logic found (no if statement in always/process)'))
            return self.issues, self.paths, self.reset_assigns

        # Check 1: Reset coverage (first branch = reset)
        self.reset_assigns = self._collect_assigns(top_if.then_body)
        reg_names = set(self.registers.keys())
        missing_at_reset = reg_names - self.reset_assigns
        if missing_at_reset:
            for r in sorted(missing_at_reset):
                self.issues.append(('CRITICAL', f'{r} NOT assigned at reset'))
        else:
            self.issues.append(('OK', 'All registers assigned at reset'))

        # Check 2: Enumerate all paths and check coverage
        self._enumerate_from_if(top_if, "")

        # Check 3: State coverage
        self._check_states_recursive(self.tree)

        # Check 4: Registers never assigned in ANY path
        all_ever_assigned = set()
        for _, assigns in self.paths:
            all_ever_assigned |= assigns
        never_assigned = reg_names - all_ever_assigned
        for r in sorted(never_assigned):
            self.issues.append(('CRITICAL', f'{r} is declared but NEVER assigned anywhere'))

        return self.issues, self.paths, self.reset_assigns

    def _collect_assigns(self, body):
        """Collect all register names assigned in a body (recursively into all branches)."""
        assigns = set()
        for node in body:
            if isinstance(node, AssignNode):
                assigns.add(node.target)
            elif isinstance(node, IfNode):
                assigns |= self._collect_assigns(node.then_body)
                assigns |= self._collect_assigns(node.else_body)
            elif isinstance(node, CaseNode):
                for _, item_body in node.items:
                    assigns |= self._collect_assigns(item_body)
        return assigns

    def _collect_direct_assigns(self, body):
        """Collect registers assigned directly (not inside branches)."""
        assigns = set()
        for node in body:
            if isinstance(node, AssignNode):
                assigns.add(node.target)
        return assigns

    def _enumerate_from_if(self, if_node, prefix):
        """Enumerate paths through an if/else chain."""
        self._enumerate_body(
            if_node.then_body,
            f"{prefix}{if_node.condition}"
        )

        if if_node.else_body:
            if (len(if_node.else_body) == 1 and
                    isinstance(if_node.else_body[0], IfNode)):
                self._enumerate_from_if(
                    if_node.else_body[0],
                    f"{prefix}!({if_node.condition}) -> "
                )
            else:
                self._enumerate_body(
                    if_node.else_body,
                    f"{prefix}!({if_node.condition}) -> else"
                )
        else:
            self.paths.append((
                f"{prefix}!({if_node.condition}) [implicit hold]",
                set()
            ))

    def _enumerate_body(self, body, prefix):
        """Enumerate all paths through a body, collecting assignments."""
        direct = self._collect_direct_assigns(body)
        branches = [n for n in body if isinstance(n, (IfNode, CaseNode))]

        if not branches:
            self.paths.append((prefix, direct))
            return

        for branch in branches:
            if isinstance(branch, IfNode):
                self._enumerate_if_paths(branch, prefix, direct)
            elif isinstance(branch, CaseNode):
                self._enumerate_case_paths(branch, prefix, direct)

    def _enumerate_if_paths(self, if_node, prefix, inherited):
        """Enumerate paths through an if/else."""
        then_direct = inherited | self._collect_direct_assigns(if_node.then_body)
        then_branches = [n for n in if_node.then_body
                         if isinstance(n, (IfNode, CaseNode))]

        path_prefix = f"{prefix} -> {if_node.condition}"
        if not then_branches:
            self.paths.append((path_prefix, then_direct))
        else:
            for b in then_branches:
                if isinstance(b, IfNode):
                    self._enumerate_if_paths(b, path_prefix, then_direct)
                elif isinstance(b, CaseNode):
                    self._enumerate_case_paths(b, path_prefix, then_direct)

        if if_node.else_body:
            else_direct = inherited | self._collect_direct_assigns(if_node.else_body)
            else_branches = [n for n in if_node.else_body
                             if isinstance(n, (IfNode, CaseNode))]

            else_prefix = f"{prefix} -> !({if_node.condition})"
            if not else_branches:
                self.paths.append((else_prefix, else_direct))
            else:
                for b in else_branches:
                    if isinstance(b, IfNode):
                        self._enumerate_if_paths(b, else_prefix, else_direct)
                    elif isinstance(b, CaseNode):
                        self._enumerate_case_paths(b, else_prefix, else_direct)
        else:
            self.paths.append((
                f"{prefix} -> !({if_node.condition}) [hold]",
                inherited
            ))

    def _enumerate_case_paths(self, case_node, prefix, inherited):
        """Enumerate paths through a case statement."""
        for label, item_body in case_node.items:
            item_direct = inherited | self._collect_direct_assigns(item_body)
            item_branches = [n for n in item_body
                             if isinstance(n, (IfNode, CaseNode))]

            item_prefix = f"{prefix} -> {case_node.expr}=={label}"
            if not item_branches:
                self.paths.append((item_prefix, item_direct))
            else:
                for b in item_branches:
                    if isinstance(b, IfNode):
                        self._enumerate_if_paths(b, item_prefix, item_direct)
                    elif isinstance(b, CaseNode):
                        self._enumerate_case_paths(b, item_prefix, item_direct)

    def _check_states_recursive(self, body):
        """Find case statements and check for missing state branches."""
        for node in body:
            if isinstance(node, CaseNode):
                if self.states and not node.has_default:
                    covered = set()
                    for label, _ in node.items:
                        for sname, senc in self.states.items():
                            if sname == label:
                                covered.add(senc.value)

                    state_width = 0
                    for s in self.states.values():
                        state_width = s.width
                        break

                    if state_width > 0:
                        all_values = set()
                        for i in range(2 ** state_width):
                            all_values.add(f"{state_width}'b{i:0{state_width}b}")

                        missing = all_values - covered
                        if missing:
                            self.issues.append((
                                'CRITICAL',
                                f'No default case branch. Missing states: '
                                f'{", ".join(sorted(missing))}'
                            ))

                for _, item_body in node.items:
                    self._check_states_recursive(item_body)

            elif isinstance(node, IfNode):
                self._check_states_recursive(node.then_body)
                self._check_states_recursive(node.else_body)


# ══════════════════════════════════════════════════════════════
# Console Report
# ══════════════════════════════════════════════════════════════

def print_report(registers, states, inputs, issues, paths, reset_assigns, language):
    sep = '=' * 60
    print(f"\n{sep}")
    print(f"  FORMAL VERIFICATION REPORT  ({language})")
    print(f"{sep}\n")

    print(f"Registers ({len(registers)}):")
    for name, reg in sorted(registers.items()):
        arr = f' [{reg.array_size} elements]' if reg.is_array else ''
        print(f"  {name:35s} [{reg.width-1}:0]{arr}")

    if inputs:
        print(f"\nInputs (assumed valid): {', '.join(sorted(inputs))}")

    if states:
        print(f"\nState encodings ({len(states)}):")
        for name, s in sorted(states.items()):
            print(f"  {name:20s} = {s.value}")

    print(f"\n{'-' * 60}")
    print("Issues:")
    for severity, msg in issues:
        icon = {'OK': '+', 'CRITICAL': 'X', 'WARNING': '!', 'INFO': '-'}.get(severity, '?')
        print(f"  [{icon}] {severity}: {msg}")

    print(f"\n{'-' * 60}")
    print("Legend:  v = assigned in this path")
    print("        b = not assigned here, but defined before (retains value)")
    print("        x = NEVER defined")

    print(f"\n{'-' * 60}")
    print("Path Coverage Table:")
    print(f"  (Total {len(paths)} execution paths)\n")

    reg_names = sorted(registers.keys())

    all_ever_assigned = set()
    for _, assigns in paths:
        all_ever_assigned |= assigns

    col_width = max(5, max((len(r) for r in reg_names), default=5))
    col_width = min(col_width, 12)

    short_names = []
    for r in reg_names:
        if len(r) <= col_width:
            short_names.append(r)
        else:
            short_names.append(r[:col_width-1] + '.')

    path_col_w = 5

    if len(reg_names) > 5 or col_width > 8:
        max_name_len = max(len(r) for r in reg_names)
        for row in range(max_name_len):
            line = ' ' * (path_col_w + 2)
            for r in reg_names:
                padded = r.ljust(max_name_len)
                line += f" {padded[row]} "
            print(line)
        print(' ' * (path_col_w + 2) + ('---' * len(reg_names)))
    else:
        header = f"{'Path':<{path_col_w}} |"
        for sn in short_names:
            header += f" {sn:^{col_width}} |"
        print(header)
        print('-' * len(header))

    for i, (path_desc, assigns) in enumerate(paths):
        row = f"P{i+1:02d}   |"
        for r in reg_names:
            if r in assigns:
                mark = 'v'
            elif r in reset_assigns:
                mark = 'b'
            else:
                mark = 'x'
            row += f" {mark:^{2}} |"
        print(row)

    print(f"\nPath descriptions:")
    for i, (path_desc, _) in enumerate(paths):
        print(f"  P{i+1:02d}: {path_desc}")

    print(f"\n{sep}")


# ══════════════════════════════════════════════════════════════
# Markdown Report Generator
# ══════════════════════════════════════════════════════════════

def generate_markdown(filepath, result, issues, paths, reset_assigns,
                      language, source_code=''):
    """Generate a markdown report file next to the source file."""
    registers = result.registers
    states = result.states
    inputs = result.inputs
    tree = result.tree
    wires = result.wires
    continuous_assigns = result.continuous_assigns

    reg_names = sorted(registers.keys())
    md = []

    source_name = Path(filepath).name
    md.append(f'# Formal Verification Report: `{source_name}`')
    md.append(f'')
    md.append(f'**Language:** {language}  ')
    md.append(f'**Source:** `{source_name}`')
    md.append('')

    # Registers table
    if registers:
        md.append('## Registers')
        md.append('')
        md.append('| Name | Width | Array | Notes |')
        md.append('|------|-------|-------|-------|')
        for name, reg in sorted(registers.items()):
            arr = f'{reg.array_size} elements' if reg.is_array else '-'
            notes = ''
            if name not in reset_assigns:
                notes = 'NOT assigned at reset'
            md.append(f'| `{name}` | [{reg.width-1}:0] | {arr} | {notes} |')
        md.append('')

    # Wires table
    if wires:
        md.append('## Wires')
        md.append('')
        md.append('| Name | Width | Driver Expression |')
        md.append('|------|-------|-------------------|')
        for name, wire in sorted(wires.items()):
            driver = f'`{wire.driver}`' if wire.driver else '*undriven*'
            md.append(f'| `{name}` | [{wire.width-1}:0] | {driver} |')
        md.append('')

    # Continuous assignments table
    if continuous_assigns:
        md.append('## Continuous Assignments')
        md.append('')
        md.append('| Target | Expression |')
        md.append('|--------|------------|')
        for ca in continuous_assigns:
            md.append(f'| `{ca.target_full}` | `{ca.value}` |')
        md.append('')

    # Ports table
    if result.ports:
        md.append('## Ports')
        md.append('')
        md.append('| Direction | Name | Width |')
        md.append('|-----------|------|-------|')
        for name, port in sorted(result.ports.items()):
            icon = '◀ Input' if port.direction == 'input' else '▶ Output'
            width_str = f'[{port.width - 1}:0]' if port.width > 1 else '1 bit'
            md.append(f'| {icon} | `{name}` | {width_str} |')
        md.append('')
    elif inputs:
        md.append(f'**Inputs (assumed valid):** `{"`, `".join(sorted(inputs))}`')
        md.append('')

    if states:
        md.append('## State Encodings')
        md.append('')
        md.append('| State | Value |')
        md.append('|-------|-------|')
        for name, s in sorted(states.items()):
            md.append(f'| `{name}` | `{s.value}` |')
        md.append('')

    # Issues
    md.append('## Issues')
    md.append('')
    _sev_emoji = {
        'OK':       '🟢',
        'CRITICAL': '🔴',
        'WARNING':  '🟠',
        'INFO':     '🔵',
    }
    for severity, msg in issues:
        emoji = _sev_emoji.get(severity, '⬜')
        md.append(f'- {emoji} **{severity}:** {msg}')
    md.append('')

    if result.is_combinatorial:
        md.append('## Dataflow Diagram')
        md.append('')
        md.append('```mermaid')
        md.append(_build_dataflow_diagram(continuous_assigns))
        md.append('```')
        md.append('')
    else:
        if tree:
            md.append('## Execution Path Diagram')
            md.append('')
            md.append('```mermaid')
            md.append(_build_mermaid(tree, registers, reset_assigns, paths))
            md.append('```')
            md.append('')

        if tree:
            state_diagram = _build_state_diagram(paths, tree, states, registers)
            if state_diagram:
                md.append('## State Machine Diagram')
                md.append('')
                md.append('```mermaid')
                md.append(state_diagram)
                md.append('```')
                md.append('')

        if paths and reg_names:
            md.append('## Path Coverage Table')
            md.append('')
            md.append('| Legend | Meaning |')
            md.append('|:-----:|---------|')
            md.append('| 🟢 **v** | assigned in this path |')
            md.append('| 🔵 **b** | not assigned here, but defined before (retains value) |')
            md.append('| 🔴 **x** | NEVER defined |')
            md.append('')

            header = '| Path |'
            sep_line = '|------|'
            for r in reg_names:
                header += f' `{r}` |'
                sep_line += ':---:|'
            md.append(header)
            md.append(sep_line)

            for i, (path_desc, assigns) in enumerate(paths):
                row = f'| P{i+1:02d} |'
                for r in reg_names:
                    if r in assigns:
                        row += ' 🟢 **v** |'
                    elif r in reset_assigns:
                        row += ' 🔵 **b** |'
                    else:
                        row += ' 🔴 **x** |'
                md.append(row)
            md.append('')

            md.append('## Path Descriptions')
            md.append('')
            for i, (path_desc, assigns) in enumerate(paths):
                missing = set(reg_names) - assigns
                md.append(f'**P{i+1:02d}:** `{path_desc}`')
                if missing:
                    retains = ', '.join(f'`{r}`' for r in sorted(missing))
                    md.append(f'  - Retains: {retains}')
                else:
                    md.append(f'  - All registers assigned')
                md.append('')

    # Source code
    if source_code:
        lang_tag = 'verilog' if language == 'Verilog' else 'vhdl'
        md.append('## Source Code')
        md.append('')
        md.append(f'```{lang_tag}')
        md.append(source_code.rstrip())
        md.append('```')
        md.append('')

    md.append('---')
    md.append('*Generated by formal_verify.py*')

    return '\n'.join(md)


# ══════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════

def analyze_file(filepath):
    path = Path(filepath)
    code = path.read_text()
    ext = path.suffix.lower()

    if ext in ('.v', '.sv', '.vh'):
        parser = VerilogParser(code)
        language = 'Verilog'
    elif ext in ('.vhd', '.vhdl'):
        parser = VHDLParser(code)
        language = 'VHDL'
    else:
        print(f"Unknown file extension: {ext}")
        sys.exit(1)

    result = parser.parse()

    if result.is_combinatorial:
        issues = [('INFO', 'Combinatorial logic only (no clocked process)')]
        driven = {ca.target for ca in result.continuous_assigns}
        for w_name, w in result.wires.items():
            if not w.driver and w_name not in driven:
                issues.append(('WARNING', f'Wire `{w_name}` is undriven'))
        paths = []
        reset_assigns = set()
    else:
        analyzer = FormalAnalyzer(
            result.registers, result.states, result.inputs, result.tree
        )
        issues, paths, reset_assigns = analyzer.analyze()

    print_report(
        result.registers, result.states, result.inputs,
        issues, paths, reset_assigns, language
    )

    md_content = generate_markdown(
        filepath, result, issues, paths, reset_assigns, language, code
    )
    md_path = path.with_suffix('.formal.md')
    md_path.write_text(md_content, encoding='utf-8')
    print(f"\nMarkdown report written to: {md_path}")

    return 1 if any(sev == 'CRITICAL' for sev, _ in issues) else 0


def main():
    if len(sys.argv) < 2:
        print("Usage: python formal_verify.py <file.v|file.vhd>")
        print("\nRunning all test cases...\n")

        script_dir = Path(__file__).parent
        test_dir = script_dir / 'test_cases'

        test_files = sorted(test_dir.glob('*.v')) + sorted(test_dir.glob('*.vhd'))
        for test_file in test_files:
            print("=" * 60)
            print(f"  TEST: {test_file.name}")
            print("=" * 60)
            analyze_file(test_file)
            print("\n")
    else:
        sys.exit(analyze_file(sys.argv[1]))


if __name__ == '__main__':
    main()

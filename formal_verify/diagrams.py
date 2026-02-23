"""
Mermaid diagram builders for the formal verification report.

Consumed by formal_verify.py (generate_markdown).
"""

import re
from hdl_parser import AssignNode, IfNode, CaseNode


# ══════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════

def _sanitize_mermaid(text, for_diamond=False):
    """Escape characters that break Mermaid syntax.

    for_diamond: if True, produce text safe for use inside diamond {{"..."}} nodes.
    """
    text = text.replace('[', '(')
    text = text.replace(']', ')')
    text = text.replace('"', '')
    text = text.replace("'", '')
    text = text.replace('#', 'Nr')
    text = text.replace('&', ' and ')
    if for_diamond:
        text = text.replace('(', '')
        text = text.replace(')', '')
    if len(text) > 60:
        text = text[:57] + '...'
    return text


# ══════════════════════════════════════════════════════════════
# Execution Path Flowchart
# ══════════════════════════════════════════════════════════════

def _build_mermaid(tree, registers, reset_assigns, paths):
    """Build a Mermaid flowchart from the AST."""
    lines = ['flowchart TD']
    node_id = [0]  # mutable counter

    def new_id(prefix='N'):
        node_id[0] += 1
        return f'{prefix}{node_id[0]}'

    def walk(body, parent_id=None):
        prev_id = parent_id

        for node in body:
            if isinstance(node, AssignNode):
                nid = new_id('A')
                label = _sanitize_mermaid(f'{node.target_full} <= {node.value}')
                lines.append(f'    {nid}["{label}"]')
                if prev_id:
                    lines.append(f'    {prev_id} --> {nid}')
                prev_id = nid

            elif isinstance(node, IfNode):
                cond_id = new_id('IF')
                cond_label = _sanitize_mermaid(node.condition, for_diamond=True)
                lines.append(f'    {cond_id}{{"{cond_label}"}}')
                if prev_id:
                    lines.append(f'    {prev_id} --> {cond_id}')

                then_entry = new_id('T')
                lines.append(f'    {then_entry}["Yes"]')
                lines.append(f'    {cond_id} -->|Yes| {then_entry}')
                walk(node.then_body, then_entry)

                if node.else_body:
                    else_entry = new_id('E')
                    lines.append(f'    {else_entry}["No"]')
                    lines.append(f'    {cond_id} -->|No| {else_entry}')
                    walk(node.else_body, else_entry)
                else:
                    hold_id = new_id('H')
                    lines.append(f'    {hold_id}["hold"]')
                    lines.append(f'    {cond_id} -->|No| {hold_id}')

                prev_id = None

            elif isinstance(node, CaseNode):
                case_id = new_id('C')
                case_label = _sanitize_mermaid(f'case {node.expr}', for_diamond=True)
                lines.append(f'    {case_id}{{"{case_label}"}}')
                if prev_id:
                    lines.append(f'    {prev_id} --> {case_id}')

                for label, item_body in node.items:
                    item_entry = new_id('S')
                    item_label = _sanitize_mermaid(label)
                    lines.append(f'    {item_entry}["{item_label}"]')
                    lines.append(f'    {case_id} -->|{item_label}| {item_entry}')
                    walk(item_body, item_entry)

                if not node.has_default:
                    miss_id = new_id('MISS')
                    lines.append(f'    {miss_id}["MISSING DEFAULT!"]')
                    lines.append(f'    {case_id} -->|???| {miss_id}')
                    lines.append(f'    style {miss_id} fill:#f66,stroke:#900,color:#fff')

                prev_id = None

    lines.append('    START((clock edge))')
    walk(tree, 'START')

    return '\n'.join(lines)


# ══════════════════════════════════════════════════════════════
# Dataflow Diagram (for combinatorial-only modules)
# ══════════════════════════════════════════════════════════════

def _build_dataflow_diagram(continuous_assigns):
    """Build a Mermaid LR flowchart showing dataflow for wire-only modules."""
    lines = ['flowchart LR']

    outputs = set()
    for ca in continuous_assigns:
        outputs.add(ca.target)

    inputs_used = set()
    for ca in continuous_assigns:
        rhs_ids = set(re.findall(r'[a-zA-Z_]\w*', ca.value))
        for sig in rhs_ids:
            if sig not in outputs:
                inputs_used.add(sig)

    for inp in sorted(inputs_used):
        lines.append(f'    {inp}(["{_sanitize_mermaid(inp)}"])')

    for out in sorted(outputs):
        lines.append(f'    {out}["{_sanitize_mermaid(out)}"]')

    for ca in continuous_assigns:
        rhs_ids = set(re.findall(r'[a-zA-Z_]\w*', ca.value))
        label = _sanitize_mermaid(ca.value)
        for sig in sorted(rhs_ids):
            if sig in inputs_used or sig in outputs:
                lines.append(f'    {sig} -->|"{label}"| {ca.target}')

    return '\n'.join(lines)


# ══════════════════════════════════════════════════════════════
# State Machine Diagram (derived from paths)
# ══════════════════════════════════════════════════════════════

def _find_case_expr_name(tree, states, registers):
    """Find the first case node expression. Prefer one matching a state register,
    fall back to any case expression (register or wire)."""
    best = None

    def _walk(nodes):
        nonlocal best
        for node in nodes:
            if isinstance(node, CaseNode):
                expr = node.expr.strip()
                if expr in registers and states:
                    labels = {label for label, _ in node.items}
                    if labels & set(states.keys()):
                        return expr
                if best is None:
                    best = expr
                for _, body in node.items:
                    r = _walk(body)
                    if r:
                        return r
            elif isinstance(node, IfNode):
                r = _walk(node.then_body)
                if r:
                    return r
                r = _walk(node.else_body)
                if r:
                    return r
        return None

    result = _walk(tree)
    return result if result else best


def _find_assigns_in_body(body, target_name):
    """Recursively find all assignments to target_name in a body."""
    results = []
    for node in body:
        if isinstance(node, AssignNode) and node.target == target_name:
            results.append(node.value.strip())
        elif isinstance(node, IfNode):
            results.extend(_find_assigns_in_body(node.then_body, target_name))
            results.extend(_find_assigns_in_body(node.else_body, target_name))
        elif isinstance(node, CaseNode):
            for _, item_body in node.items:
                results.extend(_find_assigns_in_body(item_body, target_name))
    return results


def _resolve_state_name(value, states):
    """Map a state value (like 'IDLE' or "3'b000") to a state name."""
    value = value.strip()
    if value in states:
        return value
    ternary_m = re.match(r'(\w+)\s*\?\s*(\w+)\s*:\s*(\w+)', value)
    if ternary_m:
        return None  # handled separately
    return value


def _path_short_label(path_desc):
    """Extract the most meaningful part of a path description for a state diagram label."""
    parts = [p.strip() for p in path_desc.split(' -> ')]
    if len(parts) == 1:
        return _sanitize_mermaid(parts[0])
    for part in reversed(parts):
        if '==' in part:
            _, _, val = part.partition('==')
            s = _sanitize_mermaid(val.strip())
            return s if s else _sanitize_mermaid(part)
    return _sanitize_mermaid(parts[0])


def _build_path_state_diagram(paths):
    """Build a state diagram from if/else paths (no case statement)."""
    if not paths:
        return None

    lines = ['stateDiagram-v2']
    for i, (path_desc, _assigns) in enumerate(paths):
        pid = f'P{i+1:02d}'
        label = _path_short_label(path_desc)
        lines.append(f'    state "{pid}: {label}" as {pid}')

    lines.append(f'    [*] --> P01')

    for i in range(len(paths)):
        pid = f'P{i+1:02d}'
        for j in range(len(paths)):
            if i != j:
                pjd = f'P{j+1:02d}'
                lines.append(f'    {pid} --> {pjd}')

    return '\n'.join(lines)


def _extract_transitions(body, state_reg, from_state, states, cond_parts, out):
    """Recursively extract state transitions from a case item body."""
    for node in body:
        if isinstance(node, AssignNode) and node.target == state_reg:
            value = node.value.strip()
            cond_str = ' & '.join(cond_parts) if cond_parts else ''
            ternary_m = re.match(r'(\w+)\s*\?\s*(\w+)\s*:\s*(\w+)', value)
            if ternary_m:
                var, st_true, st_false = ternary_m.groups()
                t_name = _resolve_state_name(st_true, states) or st_true
                f_name = _resolve_state_name(st_false, states) or st_false
                cond_t = f'{cond_str} & {var}' if cond_str else var
                cond_f = f'{cond_str} & !{var}' if cond_str else f'!{var}'
                out.append((from_state, t_name, cond_t))
                out.append((from_state, f_name, cond_f))
            else:
                to_name = _resolve_state_name(value, states) or value
                out.append((from_state, to_name, cond_str))
        elif isinstance(node, IfNode):
            _extract_transitions(
                node.then_body, state_reg, from_state, states,
                cond_parts + [node.condition], out
            )
            _extract_transitions(
                node.else_body, state_reg, from_state, states,
                cond_parts + [f'!({node.condition})'], out
            )
        elif isinstance(node, CaseNode):
            for label, item_body in node.items:
                _extract_transitions(
                    item_body, state_reg, from_state, states,
                    cond_parts + [f'{node.expr}=={label}'], out
                )


def _build_state_diagram(paths, tree, states, registers):
    """Build a Mermaid stateDiagram-v2 from the already-computed paths.

    Works for:
    - FSMs with named parameter states (IDLE, READ, etc.)
    - Any case statement (uses case labels directly as state names)
    - Pure if/else trees (each path becomes a state)
    """
    case_expr = _find_case_expr_name(tree, states, registers)
    if not case_expr:
        return _build_path_state_diagram(paths)

    state_names = set(states.keys()) if states else set()
    transitions = []
    reset_target = None

    def _find_case_node(nodes):
        for node in nodes:
            if isinstance(node, CaseNode) and node.expr.strip() == case_expr:
                return node
            if isinstance(node, IfNode):
                r = _find_case_node(node.then_body)
                if r:
                    return r
                r = _find_case_node(node.else_body)
                if r:
                    return r
        return None

    is_state_reg = case_expr in registers
    reset_condition = None
    if is_state_reg:
        for node in tree:
            if isinstance(node, IfNode):
                reset_assigns = _find_assigns_in_body(node.then_body, case_expr)
                if reset_assigns:
                    reset_target = _resolve_state_name(reset_assigns[0], states)
                    reset_condition = node.condition
                break

    case_node = _find_case_node(tree)
    if not case_node:
        return None

    if is_state_reg:
        for label, item_body in case_node.items:
            if label == 'default':
                continue
            from_state = label.strip()
            if state_names and from_state not in state_names:
                continue
            _extract_transitions(item_body, case_expr, from_state, states, [], transitions)
    else:
        if not paths:
            return None
        relabeled = [(_path_short_label(desc), assigns) for desc, assigns in paths]
        return _build_path_state_diagram(relabeled)

    if not transitions and not reset_target:
        return None

    lines = ['stateDiagram-v2']
    if reset_target and reset_condition:
        safe_cond = _sanitize_mermaid(reset_condition)
        lines.append(f'    state "P01 [{safe_cond}]" as RESET_STATE')
        lines.append(f'    [*] --> RESET_STATE')
        lines.append(f'    RESET_STATE --> {reset_target}')
    elif reset_target:
        lines.append(f'    [*] --> {reset_target}')

    seen = {}
    for from_s, to_s, cond in transitions:
        key = (from_s, to_s)
        if key in seen:
            seen[key].append(cond)
        else:
            seen[key] = [cond]

    for (from_s, to_s) in seen.keys():
        if from_s == to_s:
            continue
        lines.append(f'    {from_s} --> {to_s}')

    return '\n'.join(lines)

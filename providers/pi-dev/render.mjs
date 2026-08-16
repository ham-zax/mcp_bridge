function appendLines(output, annotations) {
  const base = output ?? '';
  if (annotations.length === 0) return base || 'Command completed.';
  if (!base) return annotations.join('\n');
  return `${base.endsWith('\n') ? base : `${base}\n`}${annotations.join('\n')}`;
}

export function renderBashText(result) {
  const annotations = [];
  if (result.truncated && result.full_output_path) {
    annotations.push(`[truncated · full: ${result.full_output_path}]`);
  }
  if (result.timed_out) {
    annotations.push(`[timed out after ${result.timeout_seconds}s]`);
  } else if (result.cancelled) {
    annotations.push('[cancelled]');
  } else if (result.exit_code === null) {
    annotations.push('[terminated]');
  } else if (result.exit_code !== 0) {
    annotations.push(`[exit ${result.exit_code}]`);
  }
  return appendLines(result.output, annotations);
}

export function renderEditText(relativePath, diff) {
  return diff ? `${relativePath}\n${diff}` : `Updated ${relativePath}`;
}


export function renderEditPartial({ applied = [], failed = [], uncertain = [], unattempted = [], reason } = {}) {
  const lines = ['EDIT_PARTIAL'];
  if (applied.length) lines.push(`applied: ${applied.join(', ')}`);
  if (reason) lines.push(`reason: ${reason}`);
  for (const item of failed) lines.push(`failed: ${item.path}: ${item.message}`);
  for (const item of uncertain) lines.push(`uncertain: ${item.path}: ${item.message}`);
  if (unattempted.length) lines.push(`unattempted: ${unattempted.join(', ')}`);
  return lines.join('\n');
}

export function renderWriteText(relativePath) {
  return `Created ${relativePath}`;
}

export function renderPatchText(result) {
  return result.changes.map(change => {
    if (change.kind === 'add') return `A ${change.path} (+${change.additions})`;
    if (change.kind === 'delete') return `D ${change.path} (-${change.deletions})`;
    if (change.kind === 'move') {
      return `R ${change.path} -> ${change.moveTo} (+${change.additions} -${change.deletions})`;
    }
    return `M ${change.path} (+${change.additions} -${change.deletions})`;
  }).join('\n');
}

# save as extract_rels.py, run with: python3 extract_rels.py
import json

# Build set of all node IDs we care about
node_ids = set()
with open('src/data/knowledge-graph/cc_math_nodes_all.jsonl') as f:
    for line in f:
        node_ids.add(json.loads(line)['identifier'])
print(f"Node IDs to match: {len(node_ids)}")

# Filter relationships: keep edges where BOTH ends are in our node set
# (avoids pulling in edges to Texas standards, curriculum content, etc.)
# Also separately track edges where only ONE end matches (for analysis)
both_match = 0
one_match = 0
neighbor_ids = set()

with open('src/data/knowledge-graph/relationships.jsonl') as f, \
     open('src/data/knowledge-graph/cc_math_rels_internal.jsonl', 'w') as f_internal, \
     open('src/data/knowledge-graph/cc_math_rels_border.jsonl', 'w') as f_border:
    for line in f:
        rel = json.loads(line)
        src_in = rel['source_identifier'] in node_ids
        tgt_in = rel['target_identifier'] in node_ids
        if src_in and tgt_in:
            f_internal.write(line)
            both_match += 1
        elif src_in or tgt_in:
            f_border.write(line)
            one_match += 1
            # Track what's on the other side
            if not src_in: neighbor_ids.add((rel['source_identifier'], str(rel['source_labels'])))
            if not tgt_in: neighbor_ids.add((rel['target_identifier'], str(rel['target_labels'])))

print(f"Internal edges (both ends in our set): {both_match}")
print(f"Border edges (one end in our set): {one_match}")
print(f"Unique neighbor nodes: {len(neighbor_ids)}")

# Show what types of neighbors we're connected to
from collections import Counter
neighbor_types = Counter(labels for _, labels in neighbor_ids)
print(f"\nNeighbor types (nodes we're NOT including):")
for label, count in neighbor_types.most_common():
    print(f"  {label}: {count}")

# Edge type breakdown for internal edges
with open('src/data/knowledge-graph/cc_math_rels_internal.jsonl') as f:
    rel_types = Counter()
    for line in f:
        rel_types[json.loads(line)['label']] += 1
print(f"\nInternal edge types:")
for t, c in rel_types.most_common():
    print(f"  {t}: {c}")
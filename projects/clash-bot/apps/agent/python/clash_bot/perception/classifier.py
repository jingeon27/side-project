"""Card and unit identities of screen crops from the fixed ONNX classifier and atlas."""

import numpy as np


def canonical(label):
    name = label.removesuffix("-evolution").removesuffix("-hero")
    return {
        "furnace": "furnace",
        "ice-wizard": "ice_wizard",
        "knight": "knight",
        "goblin-hut": "goblin_hut",
        "skeleton": "skeletons",
        "barbarian": "barbarian_barrel",
        "barbarian-barrel": "barbarian_barrel",
        "graveyard": "graveyard",
        "poison": "poison",
    }.get(name)


def unit_kind(label):
    name = label.removesuffix("-evolution").removesuffix("-hero")
    return {
        "furnace": "furnace",
        "ice-wizard": "ice_wizard",
        "knight": "knight",
        "goblin-hut": "goblin_hut",
        "skeleton": "skeleton",
        "barbarian": "barbarian",
        "fire-spirit": "fire_spirit",
        "spear-goblin": "spear_goblin",
        "barbarian-barrel": "barrel",
    }.get(name)


class CropClassifier:
    """Mixed into VisionWorker, which loads `classifier`, `classes` and the atlas."""

    def classify(self, image, boxes, include_labels=False):
        crops = []
        for left, top, right, bottom in boxes:
            crop = image.crop(
                (max(0, int(left)), max(0, int(top)), min(368, int(right)), min(652, int(bottom)))
            )
            pixels = np.asarray(crop.resize((112, 112)), dtype=np.float32) / 255
            crops.append(
                ((pixels - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)
            )
        if not crops:
            return []
        logits, features = self.classifier.run(
            None, {"images": np.asarray(crops, dtype=np.float32)}
        )
        probabilities = np.exp(logits - logits.max(axis=1, keepdims=True))
        probabilities /= probabilities.sum(axis=1, keepdims=True)
        results = []
        for row, feature in zip(probabilities, features):
            card = canonical(self.classes[int(row.argmax())])
            kind = unit_kind(self.classes[int(row.argmax())])
            # Normal, evolution and hero variants may split probability mass.
            confidence = sum(
                float(value)
                for label, value in zip(self.classes, row)
                if card is not None and canonical(label) == card
            )
            if card is None and kind is not None:
                confidence = sum(
                    float(value)
                    for label, value in zip(self.classes, row)
                    if unit_kind(label) == kind
                )
            label = self.classes[int(row.argmax())]
            variant = (
                (
                    "evolution"
                    if label.endswith("-evolution")
                    else "hero"
                    if label.endswith("-hero")
                    else "base"
                )
                if row.max() >= 0.8
                else "unknown"
            )
            result = {
                "label": self.classes[int(row.argmax())],
                "confidence": confidence,
                "card": card,
                "kind": kind,
                "variant": variant,
                "raw_confidence": float(row.max()),
                "recognition": "pretrained_crop",
            }
            result["card_scores"] = {
                name: sum(
                    float(value)
                    for label, value in zip(self.classes, row)
                    if canonical(label) == name
                )
                for name in (
                    "furnace",
                    "ice_wizard",
                    "knight",
                    "goblin_hut",
                    "skeletons",
                    "barbarian_barrel",
                    "graveyard",
                    "poison",
                )
            }
            if include_labels:
                result["label_scores"] = {
                    label: float(value) for label, value in zip(self.classes, row)
                }
            if self.atlas_features is not None:
                scores = self.atlas_features @ (feature / (np.linalg.norm(feature) + 1e-8))
                grouped = {
                    name: max(
                        float(score)
                        for score, entry in zip(scores, self.atlas["cards"])
                        if entry == name
                    )
                    for name in set(self.atlas["cards"])
                }
                ranked = sorted(grouped.items(), key=lambda item: item[1], reverse=True)
                name, similarity = ranked[0]
                margin = similarity - ranked[1][1]
                result["atlas_scores"] = grouped
                if (
                    similarity >= 0.92
                    and margin >= 0.04
                    and name != "background"
                    and (confidence < 0.9 or card == name)
                ):
                    result.update(
                        {
                            "card": name,
                            "label": f"atlas:{name}",
                            "confidence": min(1.0, max(0.0, similarity)),
                            "kind": {"skeletons": "skeleton", "barbarian_barrel": "barbarian"}.get(
                                name, name
                            ),
                            "variant": "unknown",
                            "recognition": "counterpush_atlas",
                            "atlas_margin": margin,
                        }
                    )
            results.append(result)
        return results

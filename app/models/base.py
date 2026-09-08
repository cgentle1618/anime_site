"""Shared ORM mixins used across media models."""


class NameFallbackMixin:
    """
    Mixin providing standardized multi-language fallback logic for display names.
    Ensures consistent UI presentation across different media levels.
    """

    _name_fields: list = []

    def get_fallback_name(self, sequence_keys: list, start_from: str = "CN") -> str:
        """
        Sequence: Iterate through provided fields and return the first non-empty value.
        """
        # Determine starting index based on preference
        start_idx = 0
        for i, (lang, _) in enumerate(sequence_keys):
            if lang == start_from:
                start_idx = i
                break

        # Return first non-empty string found from start point
        for i in range(start_idx, len(sequence_keys)):
            val = sequence_keys[i][1]
            if val and str(val).strip():
                return str(val).strip()
        return ""

    def get_all_names(self) -> set:
        return {
            getattr(self, f).strip().lower()
            for f in self._name_fields
            if getattr(self, f) and str(getattr(self, f)).strip()
        }

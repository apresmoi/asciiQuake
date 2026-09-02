# Dependency patches

`glyphcss@0.1.6.patch` is the installable rebuild of GlyphCSS's published,
minified distribution. `glyphcss@0.1.6.source.patch` is the same change against
the tagged TypeScript source so it can be reviewed and rebased when GlyphCSS is
upgraded. App regressions cover both near-plane texture sampling and baked-light
surfaces; each fails against unpatched 0.1.6.

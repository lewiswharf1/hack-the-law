# Design System — Scaffold (Legal Argument Graph Tool)

## 1. Color Palette

### Primary Colors
| Name | Value | Usage |
|---|---|---|
| Background Light | `#E8F4F8` | Page backgrounds, hero sections |
| Navy Dark | `#1a1a2e` | Primary text, headings |
| White | `#FFFFFF` | Card backgrounds, panels, content areas |
| Light Gray | `#F5F5F5` | Subtle backgrounds, borders |
| Medium Gray | `#9A9A9A` | Secondary text, placeholders |

### Accent Colors
| Name | Value | Usage |
|---|---|---|
| Purple | `#7C3AED` | Tags, secondary actions, focus states |
| Green | `#10B981` | Success, checkmarks, "Established" status |
| Red | `#EF4444` | Gaps, danger states, "Adverse" evidence |
| Teal | `#06B6D4` | Links, interactive elements, "In Progress" |
| Amber | `#F59E0B` | Warnings, "Contested" status |

---

## 2. Typography

### Font Families
```css
/* Headings: Classic serif */
font-family: "Garamond", "Times New Roman", serif;

/* Body & UI: Clean sans-serif */
font-family: -apple-system, "Segoe UI", "Helvetica Neue", sans-serif;
```

### Type Scale
| Level | Size | Weight | Usage |
|---|---|---|---|
| H1 | 56px | 400 | Hero headings, page titles |
| H2 | 40px | 400 | Section headings |
| H3 | 28px | 600 | Card titles, element/proposition names |
| H4 | 20px | 600 | Component headings |
| Body Large | 18px | 400 | Body text, descriptions |
| Body | 16px | 400 | Default body text, evidence excerpts |
| Body Small | 14px | 400 | Secondary text, captions |
| Label | 12px | 600 | Tags, badges, status labels |

### Line Heights
- Headings: `1.2`
- Body text (long form): `1.6`
- UI elements: `1.4`

---

## 3. Spacing System

Using an 8px base unit:

```
8px   (1x)     — small gaps, icon spacing
12px  (1.5x)   — component padding
16px  (2x)     — standard padding, default margins
24px  (3x)     — section spacing, card padding
32px  (4x)     — major section spacing
48px  (6x)     — hero/layout spacing
```

### Common Patterns
- **Card padding**: 24px
- **Button padding**: 12px (vertical) × 20px (horizontal)
- **Section margins**: 48px vertical
- **Component gaps**: 16px
- **List item padding**: 12px
- **Graph node spacing**: 32px

---

## 4. Components

### Buttons
```css
/* Primary Button (Dark, pill-shaped) */
Background: #1a1a2e
Color: #FFFFFF
Padding: 12px 20px
Border-radius: 24px
Font-weight: 600
Font-size: 14px
Transition: all 0.2s ease-in-out

Hover: 
  Background: #0f0f1e (darker)
  Box-shadow: 0 4px 6px rgba(0, 0, 0, 0.12)

Active:
  Transform: scale(0.98)
```

```css
/* Secondary Button (Outlined) */
Background: transparent
Border: 1px solid #E0E0E0
Color: #1a1a2e
Padding: 12px 20px
Border-radius: 24px
Font-weight: 600

Hover:
  Border-color: #7C3AED
  Color: #7C3AED
```

```css
/* Small Button (for inline actions) */
Padding: 8px 12px
Font-size: 12px
Border-radius: 6px
```

### Status Badges
```css
Background: varies by status
Color: white

Statuses:
  - Established: #10B981 (green)
  - Contested: #F59E0B (amber)
  - Gap: #9A9A9A (gray)
  
Padding: 4px 12px
Border-radius: 12px
Font-size: 12px
Font-weight: 600
```

### Evidence Classification Tags
```css
- Supportive: #10B981 (green)
- Adverse: #EF4444 (red)
- Neutral: #9A9A9A (gray)

Padding: 6px 12px
Border-radius: 6px
Font-size: 12px
Font-weight: 500
```

### Cards
```css
Background: #FFFFFF
Border: none
Border-radius: 8px
Box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)
Padding: 24px

Hover:
  Box-shadow: 0 4px 6px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)
  Transition: box-shadow 0.2s ease-in-out
```

### Graph Nodes (Elements & Propositions)
```css
Background: #FFFFFF
Border: 2px solid #E0E0E0
Border-radius: 8px
Padding: 16px
Min-width: 240px

Selected:
  Border-color: #7C3AED
  Box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1)

Hover:
  Border-color: #9A9A9A
  Cursor: pointer
```

### Input Fields
```css
Background: #FFFFFF
Border: 1px solid #E0E0E0
Border-radius: 6px
Padding: 12px 16px
Font-size: 16px
Placeholder color: #9A9A9A

Focus:
  Border-color: #7C3AED
  Box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1)
  Outline: none
```

### Tabs
```css
Tab item:
  Border-bottom: 2px solid transparent
  Color: #9A9A9A
  Font-weight: 600
  Padding: 12px 16px
  Cursor: pointer

Active tab:
  Border-bottom-color: #1a1a2e
  Color: #1a1a2e
```

### Modals / Overlays
```css
Backdrop: rgba(0, 0, 0, 0.5)
Modal:
  Background: #FFFFFF
  Border-radius: 12px
  Box-shadow: 0 20px 25px rgba(0, 0, 0, 0.15), 0 10px 10px rgba(0, 0, 0, 0.05)
  Padding: 32px
  Max-width: 600px
```

---

## 5. Layout & Structure

### Main Application Layout
```
┌─────────────────────────────────────────┐
│          Top Navigation Bar (60px)      │
├─────────────────────────────────────────┤
│         │  Main Content  │              │
│Sidebar  │     Area       │  Right Panel │
│(240px)  │  (flexible)    │  (320px)     │
│         │                │              │
└─────────────────────────────────────────┘
```

### Sidebar (Cases List / Navigation)
- **Width**: 240px
- **Background**: #F5F5F5
- **Border-right**: 1px solid #E0E0E0
- **Padding**: 16px
- **Scrollable**: max-height calc(100vh - 60px)

### Main Content Area
- **Background**: #E8F4F8 (light) or #FFFFFF (content cards)
- **Padding**: 24px
- **Max-width**: 1200px (for text readability)
- **Flex**: 1 (grows to fill available space)

### Right Panel (Graph Overview, Gaps, Stats)
- **Width**: 320px
- **Background**: #F5F5F5
- **Border-left**: 1px solid #E0E0E0
- **Padding**: 16px
- **Scrollable**: max-height calc(100vh - 60px)

### Header / Navigation Bar
- **Height**: 60px
- **Background**: #FFFFFF
- **Border-bottom**: 1px solid #E0E0E0
- **Padding**: 0 24px
- **Align**: space-between (logo left, actions right)

---

## 6. Argument Graph Visualization

### Element Node
```css
Display: Card-like block
Label: "E1", "E2", etc. (small badge, navy)
Title: Bold, 20px
Status: Color-coded badge (Established/Contested/Gap)
Source: Secondary text, 12px

Padding: 16px
Border: 2px solid #E0E0E0
Border-radius: 8px
```

### Proposition Node
```css
Display: Nested under Element
Indentation: 16px from parent
Label: "E1-P1", etc.
Title: 16px, regular weight
Status: Small badge
Evidence count: Right-aligned, secondary text

Padding: 12px 16px
Background: #F9F9F9
Border-left: 3px solid (status color)
```

### Connection Lines
- **Color**: #D1D5DB (light gray)
- **Stroke-width**: 2px
- **Style**: Straight or curved based on layout

---

## 7. Evidence Display

### Evidence Item Card
```css
Background: #FFFFFF
Border: 1px solid #E0E0E0
Border-left: 3px solid (classification color)
Padding: 16px
Border-radius: 6px
Margin-bottom: 12px

Excerpt:
  Font-size: 14px
  Font-style: italic
  Color: #1a1a2e
  Margin-bottom: 8px

Metadata (classification, source):
  Font-size: 12px
  Color: #9A9A9A
  Flex: space-between
```

### Gap Alert
```css
Background: #FEF2F2 (light red)
Border: 1px solid #FECACA (light red border)
Border-left: 4px solid #EF4444 (red)
Padding: 16px
Border-radius: 6px

Title: 14px, bold, #1a1a2e
Description: 12px, #9A9A9A
Severity badge: inline, right-aligned
```

---

## 8. Interactive States

### Hover
```css
Card: 
  Box-shadow increases slightly
  Transform: translateY(-2px) (optional, subtle lift)
  
Button:
  Opacity: 0.9 or darker background
  Cursor: pointer

Link:
  Color: #7C3AED
  Text-decoration: underline
```

### Focus
```css
All interactive elements:
  Outline: 2px solid #7C3AED
  Outline-offset: 2px
```

### Active / Selected
```css
Graph node:
  Border-color: #7C3AED
  Box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1)

Tab:
  Border-bottom-color: #1a1a2e
```

### Loading
```css
Spinner:
  Animation: rotate 360° over 1.5s (linear)
  Color: #06B6D4
  Size: 32px
  
Text: "Loading...", "Building graph...", etc. (14px, gray)
```

### Disabled
```css
Button/Input:
  Opacity: 0.5
  Cursor: not-allowed
  Background: #F5F5F5
```

---

## 9. Shadows (Elevation)

```css
/* Subtle (cards at rest) */
0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)

/* Elevated (hover, active cards) */
0 4px 6px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)

/* High (modals, tooltips, popovers) */
0 20px 25px rgba(0, 0, 0, 0.15), 0 10px 10px rgba(0, 0, 0, 0.05)
```

---

## 10. Responsive Behavior

### Breakpoints
```css
Mobile:  0px – 640px   (single column, hidden right panel)
Tablet:  640px – 1024px (collapsed sidebar, single-column content)
Desktop: 1024px+       (full 3-column layout)
```

### Layout Adjustments
- **Sidebar**: Collapsible on tablet/mobile (hamburger menu)
- **Right panel**: Hidden on mobile, shown on desktop
- **Padding**: 12px (mobile) → 16px (tablet) → 24px (desktop)
- **Font sizes**: Reduced 2-4px on mobile for readability

---

## 11. Animations & Transitions

### Default Transition
```css
transition: all 0.2s ease-in-out;
```

| Element | Animation | Duration | Easing |
|---|---|---|---|
| Button hover | Opacity/shadow | 200ms | ease-in-out |
| Loading spinner | Rotate 360° | 1500ms | linear |
| Modal open | Fade + scale | 300ms | ease-out |
| Tab switch | Fade | 150ms | ease-in-out |
| Toast notification | Slide-in | 400ms | ease-out |
| Graph node selection | Scale + shadow | 200ms | ease-out |

---

## 12. Icons

### Icon Style
- **Format**: SVG (scalable, crisp)
- **Stroke-based** design (outline icons)
- **Sizes**: 16px (small), 24px (medium), 32px (large)
- **Stroke-width**: 1.5–2px
- **Color**: Inherits text color or semantic color

### Common Icons
- **Checkmark** (green): Evidence supported
- **X** (red): Evidence adverse
- **Minus** (gray): Evidence neutral
- **Alert triangle** (amber): Gap or warning
- **File/PDF** (red): Document icon
- **Folder**: Case/project folder
- **Settings**: Configuration

---

## 13. Forms

### Form Layout
```css
Label:
  Font-size: 14px
  Font-weight: 600
  Color: #1a1a2e
  Margin-bottom: 8px
  Display: block

Input / Textarea:
  Width: 100%
  Padding: 12px 16px
  Border: 1px solid #E0E0E0
  Border-radius: 6px
  Font-size: 16px
  
Error message:
  Color: #EF4444
  Font-size: 12px
  Margin-top: 4px
```

### Form Groups
```css
Fieldset:
  Padding: 24px
  Border: 1px solid #E0E0E0
  Border-radius: 8px
  Background: #F9F9F9
  Margin-bottom: 24px
  
Legend:
  Font-size: 16px
  Font-weight: 600
```

### Form Spacing
- **Between fields**: 24px
- **Between form groups**: 32px
- **Button area**: Padding-top 24px, border-top 1px

---

## 14. Accessibility

### Color Contrast
- **Text on light backgrounds**: WCAG AA minimum (4.5:1)
- **Interactive elements**: WCAG AA minimum (3:1)
- **Do not rely on color alone** for status/classification

### Focus Management
- **Tab order**: Logical (left-to-right, top-to-bottom)
- **Focus indicator**: 2px outline, clearly visible
- **Focus visible**: On all interactive elements

### Keyboard Navigation
- **Tab**: Move forward through focusable elements
- **Shift + Tab**: Move backward
- **Enter**: Activate button/submit form
- **Escape**: Close modal/popover
- **Arrow keys**: Navigate graph nodes (if applicable)

### Touch Targets
- **Minimum size**: 44px × 44px (mobile)
- **Minimum spacing**: 8px between targets

### Text
- **Minimum font size**: 14px
- **Line height**: 1.4–1.6 for body text
- **Avoid justified text** (use left-align or centered)

---

## 15. Design Tokens (JSON)

```json
{
  "colors": {
    "primary": "#7C3AED",
    "success": "#10B981",
    "warning": "#F59E0B",
    "error": "#EF4444",
    "info": "#06B6D4",
    "background": "#E8F4F8",
    "surface": "#FFFFFF",
    "text": {
      "primary": "#1a1a2e",
      "secondary": "#9A9A9A"
    },
    "border": "#E0E0E0",
    "subtle": "#F5F5F5"
  },
  "spacing": {
    "xs": "8px",
    "sm": "12px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px",
    "2xl": "48px"
  },
  "borderRadius": {
    "sm": "6px",
    "md": "8px",
    "lg": "12px",
    "full": "24px"
  },
  "typography": {
    "fontFamily": {
      "serif": "'Garamond', 'Times New Roman', serif",
      "sans": "-apple-system, 'Segoe UI', 'Helvetica Neue', sans-serif"
    },
    "fontSize": {
      "h1": "56px",
      "h2": "40px",
      "h3": "28px",
      "h4": "20px",
      "bodyLarge": "18px",
      "body": "16px",
      "bodySmall": "14px",
      "label": "12px"
    }
  },
  "shadows": {
    "subtle": "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)",
    "elevated": "0 4px 6px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)",
    "high": "0 20px 25px rgba(0, 0, 0, 0.15), 0 10px 10px rgba(0, 0, 0, 0.05)"
  }
}
```

---

## 16. Implementation Notes

### Tailwind CSS Mapping
```javascript
module.exports = {
  theme: {
    colors: {
      primary: '#7C3AED',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#06B6D4',
      background: '#E8F4F8',
      surface: '#FFFFFF',
    },
    spacing: {
      xs: '8px',
      sm: '12px',
      md: '16px',
      lg: '24px',
      xl: '32px',
      '2xl': '48px',
    },
  },
}
```

### CSS Variables (Alternative)
```css
:root {
  --color-primary: #7C3AED;
  --color-success: #10B981;
  --color-error: #EF4444;
  --spacing-md: 16px;
  --font-serif: 'Garamond', 'Times New Roman', serif;
  --font-sans: -apple-system, 'Segoe UI', 'Helvetica Neue', sans-serif;
  --shadow-subtle: 0 1px 3px rgba(0, 0, 0, 0.08);
}
```

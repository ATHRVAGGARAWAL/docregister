import { forwardRef, type ReactNode, type SVGProps } from "react";

/**
 * Shared props for docregister's local icon set.
 *
 * Icons are decorative by default. Pass `title` (or `aria-label`) when an icon
 * carries meaning without adjacent text; the SVG then becomes a labelled image.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number | string;
  title?: string;
}

export function createIcon(displayName: string, drawing: ReactNode) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function DocregisterIcon(
    {
      size = 24,
      title,
      strokeWidth = 1.75,
      "aria-hidden": ariaHidden,
      "aria-label": ariaLabel,
      role,
      ...props
    },
    ref,
  ) {
    const accessibleLabel = title ?? ariaLabel;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        role={accessibleLabel ? (role ?? "img") : role}
        aria-label={accessibleLabel}
        aria-hidden={accessibleLabel ? undefined : (ariaHidden ?? true)}
        {...props}
      >
        {title ? <title>{title}</title> : null}
        {drawing}
      </svg>
    );
  });

  Icon.displayName = displayName;
  return Icon;
}

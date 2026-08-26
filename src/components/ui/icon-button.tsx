import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";

type IconButtonProps = Omit<ButtonProps, "aria-label" | "size"> & {
  label: string;
  size?: "icon" | "icon-sm";
};

function IconButton({ label, size = "icon", type = "button", ...props }: IconButtonProps) {
  return <Button aria-label={label} size={size} type={type} {...props} />;
}

export { IconButton, type IconButtonProps };

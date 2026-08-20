import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";

import { cn } from "@/lib/utils";

let openSelectCount = 0;

type SelectProps = Omit<
  ComponentPropsWithoutRef<typeof SelectPrimitive.Root>,
  "onOpenChange"
> & {
  onOpenChange?: (open: boolean) => void;
};

export function Select({ onOpenChange, open, ...props }: SelectProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;

  useEffect(() => {
    if (!isOpen) return;
    openSelectCount += 1;
    document.documentElement.classList.add("cody-select-open");
    return () => {
      openSelectCount -= 1;
      if (openSelectCount === 0) document.documentElement.classList.remove("cody-select-open");
    };
  }, [isOpen]);

  return (
    <SelectPrimitive.Root
      onOpenChange={(nextOpen) => {
        if (open === undefined) setUncontrolledOpen(nextOpen);
        onOpenChange?.(nextOpen);
      }}
      open={isOpen}
      {...props}
    />
  );
}
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ children, className, ...props }, ref) => (
  <SelectPrimitive.Trigger className={cn("cody-select-trigger", className)} ref={ref} {...props}>
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown aria-hidden="true" className="cody-select-chevron" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
    portalContainer?: HTMLElement | null;
  }
>(({ children, className, portalContainer, position = "popper", sideOffset = 6, ...props }, ref) => (
  <SelectPrimitive.Portal container={portalContainer ?? undefined}>
    <SelectPrimitive.Content
      className={cn("cody-select-content", className)}
      position={position}
      ref={ref}
      sideOffset={sideOffset}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="cody-select-scroll-button">
        <ChevronUp aria-hidden="true" />
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="cody-select-viewport">
        {children}
      </SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="cody-select-scroll-button">
        <ChevronDown aria-hidden="true" />
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectLabel = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label className={cn("cody-select-label", className)} ref={ref} {...props} />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

export const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ children, className, ...props }, ref) => (
  <SelectPrimitive.Item className={cn("cody-select-item", className)} ref={ref} {...props}>
    <SelectPrimitive.ItemIndicator className="cody-select-indicator">
      <Check aria-hidden="true" />
    </SelectPrimitive.ItemIndicator>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

export const SelectSeparator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator className={cn("cody-select-separator", className)} ref={ref} {...props} />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

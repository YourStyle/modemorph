import React from 'react';
import { Badge, Button } from '@chakra-ui/react';

interface WardrobeItem {
  id: string;
  name: string;
  is_basic: boolean;
}

interface WardrobeItemCardProps {
  item: WardrobeItem;
  onMakeBasic?: (itemId: string) => void;
}

const WardrobeItemCard: React.FC<WardrobeItemCardProps> = ({ item, onMakeBasic }) => {
  return (
    <div className="wardrobe-item-card">
      <h2>{item.name}</h2>
      <div className="badges">
        {/* Existing badges here */}
        {item.is_basic && (
          <Badge variant="secondary" className="text-xs">
            Базовая
          </Badge>
        )}
      </div>
      <div className="actions">
        {/* Existing actions here */}
        {!item.is_basic && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onMakeBasic?.(item.id);
            }}
            className="text-xs"
          >
            Сделать базовой
          </Button>
        )}
      </div>
    </div>
  );
};

export default WardrobeItemCard;

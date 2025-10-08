// test-recommendations.js
// Простой тест для проверки API рекомендаций

const testData = [
  {
    "title": "Casual Outing",
    "looks_count": 3,
    "suggestions": [
      {
        "id": "look1",
        "items": [
          {
            "id": 430,
            "url": null,
            "name": "Куртка",
            "color": "",
            "notes": "",
            "shade": "",
            "user_id": "d60e568f-eb61-4f40-9438-3def6485ba0e",
            "has_print": false,
            "image_url": "https://storage.yandexcloud.net/modemorphs3/upload-dACMHHHp.jpeg"
          },
          {
            "id": 431,
            "url": null,
            "name": "Брюки",
            "color": "",
            "notes": "",
            "shade": "",
            "user_id": "d60e568f-eb61-4f40-9438-3def6485ba0e",
            "has_print": false,
            "image_url": "https://storage.yandexcloud.net/modemorphs3/upload-3kr1keyb.jpeg"
          }
        ],
        "title": "Casual Look 1",
        "suggested_items_count": 2
      }
    ]
  }
];

console.log('Test recommendations data:');
console.log(JSON.stringify(testData, null, 2));
console.log('\nTo test:');
console.log('1. POST to /api/recommendations with this data');
console.log('2. GET from /api/recommendations to retrieve');
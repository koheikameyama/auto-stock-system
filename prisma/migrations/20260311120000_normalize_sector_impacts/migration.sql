-- NewsAnalysis.sectorImpacts のセクター名を正規化
-- AI自由記述 → SECTOR_MASTER の11グループ名に統一

UPDATE "NewsAnalysis"
SET "sectorImpacts" = (
  SELECT jsonb_agg(
    jsonb_set(
      elem,
      '{sector}',
      to_jsonb(
        CASE elem->>'sector'
          -- 英語名 → 正規名
          WHEN 'Technology' THEN '半導体・電子部品'
          WHEN 'Automotive' THEN '自動車'
          WHEN 'Banking' THEN '金融'
          WHEN 'Finance' THEN '金融'
          WHEN 'Energy' THEN 'エネルギー'
          WHEN 'Pharmaceutical' THEN '医薬品'
          WHEN 'Real Estate' THEN '不動産'
          WHEN 'Retail' THEN '小売'
          WHEN 'Transportation' THEN '運輸'
          WHEN 'Materials' THEN '素材'
          WHEN 'IT' THEN 'IT・サービス'
          -- 日本語略称 → 正規名
          WHEN '半導体' THEN '半導体・電子部品'
          WHEN 'テクノロジー' THEN '半導体・電子部品'
          WHEN '銀行' THEN '金融'
          WHEN 'IT・通信' THEN 'IT・サービス'
          -- 既に正規名のものはそのまま
          ELSE COALESCE(
            CASE
              WHEN elem->>'sector' IN (
                '半導体・電子部品', '自動車', '金融', '医薬品',
                'IT・サービス', 'エネルギー', '小売', '不動産',
                '素材', '運輸', 'その他'
              ) THEN elem->>'sector'
              ELSE 'その他'
            END,
            'その他'
          )
        END
      )
    )
  )
  FROM jsonb_array_elements("sectorImpacts"::jsonb) AS elem
)
WHERE "sectorImpacts" IS NOT NULL;

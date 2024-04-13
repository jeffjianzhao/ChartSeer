from openai import OpenAI
import json
import os
os.environ["http_proxy"] = "http://localhost:7890"
os.environ["https_proxy"] = "http://localhost:7890"


class VegaLiteGenerator:
    def __init__(self):
        t ='''用户想要对一个数据进行可视化分析，用户会输入他的意图，想要怎么样的可视化，然后用户接下来的输入有两个，第一个是json格式的vega-lite语法表示的可视化图表，这个图表只有设计属性，数据属性field用num或str表示；第二个输入是json格式的数据集。请根据数据集补充可视化图表的数据属性，生成补充完数据属性的完整的可视化图表，你必须保证field的值不为sum或者str而是有效的数据属性。你必须在保证生成的可视化图表符合用户探索意图的情况下，尽可能多地生成可视化！
vega-lite图表生成最终结果样例：
{
            "encoding": {
                "y": {
                    "field": "Miles_per_Gallon",
                    "type": "quantitative"
                },
                "x": {
                    "field": "Year",
                    "type": "temporal",
                    "timeUnit": "year"
                }
            },
            "mark": "point"
        }
你的输出必须使用json格式输出，必须包括可视化字典列表，其中每个字典必须有一个可视化解释和vega-lite可视化代码。你的输出必须有且只有一个json格式字符串！
Json包括一个列表(key is visualization_list)，每个列表包括一个字典，每个字典有且只有两个键：“explanation”,"vega-lite_code"'''
        self.instruction = t
        self.intense_list = []

    def generate(self, persona):

        system_message = {"role": "system",
                          "content": self.instruction}
        client = OpenAI()
        response = client.chat.completions.create(
            messages=[system_message, {"role": "user", "content": persona}],
            temperature=0.9,
            model="gpt-3.5-turbo-0125",
            response_format={"type": "json_object"}
        )
        intents = json.loads(response.choices[0].message.content)
        filtered_intents = {key: value for key, value in intents.items() if value}

        intent_list = []
        for intent_type, intent_messages in filtered_intents.items():
            for message in intent_messages:
                intent_list.append({"intent_type": intent_type, "message": message})
        self.intense_list = intent_list
        self.codes = [element['message']['vega-lite_code'] for element in intent_list if 'message' in element and 'vega-lite_code' in element['message']]
        self.explanation = [element['message']['explanation'] for element in intent_list if
                      'message' in element and 'vega-lite_code' in element['message']]

        return intent_list

    def get_codes(self):
        return self.codes
    def get_explanation(self):
        return self.explanation

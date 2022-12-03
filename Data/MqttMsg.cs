using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace HawkAI.Data
{
    public class MqttMsg
    {        
        public string? time { get; set; }
        public string? addr { get; set; }
        public string? type { get; set; }
        public string? label { get; set; }
        public string? image { get; set; }
        
    }
}
